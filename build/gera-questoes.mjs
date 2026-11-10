#!/usr/bin/env node
// build/gera-questoes.mjs — gerador das páginas /q/{ID} do hub Noos.
// spec-pagina-de-questao.md (proposta v1, implementada na v10; roteamento
// revisado na v10.2 — plano C: 100% estático, zero função, zero rewrites).
//
// Lê `noos.registry.json` + `manifestos/*.jsonl`, valida com o parser do
// pacote `@ironidesflj/axon` (devDependency de build, pin exato — ZERO Axon
// no output servido) e emite:
//
//   pt/q/{ID}/index.html + en/q/{ID}/index.html   páginas da questão (pares)
//   pt/q/{alias}/index.html + en/q/{alias}/…      páginas de redirect (alias)
//   q/{ID}/index.html + q/{alias}/index.html       redirect sem idioma → PT
//   sitemap.xml                                    base + uma entrada por questão
//
// Por que páginas de redirect (v10.2): a plataforma rejeitou
// `handle: filesystem` no build, e sem ele os rewrites aplicam ANTES do
// filesystem — sombreariam as páginas canônicas. Alias e forma sem idioma
// viram, portanto, arquivos estáticos: 200 + meta refresh 0s + canonical
// para a canônica + location.replace. A ID legada continua honrada: resolve
// sempre, na mesma língua, alias em salto único (o destino já é a canônica).
// Desconhecidas caem no not-found estático (o 404.html do output).
//
// Regras da constitution embutidas: linha inválida é rejeitada com log e o
// build segue (§ sempre 2); checksum divergente rejeita a linha; alias
// duplicada rejeita o record; ID duplicada entre arquivos é rejeitada.
// Zero manifestos = zero páginas, sitemap igual à base — o site fica byte a
// byte igual (a mãe funciona com zero apps no ar, § nunca 5).
//
// Modo `--qa`: lê `build/fixtures/` em vez de `manifestos/`, escreve em
// `.qa-dist/` e roda as asserções de aceitação da spec. Sai com 0 (PASS)
// ou 1 (FAIL). O fixture NÃO é dado real — nunca acende páginas no ar.

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, verifyChecksum, validateId, isRetired } from '@ironidesflj/axon';
import { renderNoosAvatarSvg } from './lib/noos-avatar.mjs';
import { loadDiscussao } from './lib/discussao.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QA = process.argv.includes('--qa');
const SRC_DIR = QA ? path.join(ROOT, 'build', 'fixtures') : path.join(ROOT, 'manifestos');
const OUT_DIR = QA ? path.join(ROOT, '.qa-dist') : ROOT;

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date();
const BUILD_PT = `${PT_MONTHS[NOW.getMonth()]}/${NOW.getFullYear()}`;
const BUILD_EN = `${EN_MONTHS[NOW.getMonth()]}/${NOW.getFullYear()}`;

// ---------- helpers

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fill = (template, map) => {
  let out = template;
  for (const [key, value] of Object.entries(map)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
};

const log = (msg) => console.log(`[gera-questoes] ${msg}`);
const rejections = [];
const reject = (file, lineNumber, id, reason) => {
  rejections.push({ file, lineNumber, id, reason });
  log(`REJEITADA ${file}:${lineNumber}${id ? ` (${id})` : ''} — ${reason}`);
};

// ---------- entrada: registry + manifestos

const registry = JSON.parse(await readFile(path.join(ROOT, 'noos.registry.json'), 'utf8'));
const nsByPrefix = new Map(registry.namespaces.map((ns) => [ns.prefix, ns]));

const manifestFiles = existsSync(SRC_DIR)
  ? (await readdir(SRC_DIR)).filter((f) => f.endsWith('.jsonl')).sort()
  : [];

const accepted = []; // { record, prefix, lineNumber, ns }
const aliasMap = {}; // alias -> canônica (validação de unicidade; não vira output)
const seenIds = new Map(); // id -> arquivo:linha (dedup global entre arquivos)

for (const file of manifestFiles) {
  const prefix = file.replace(/\.jsonl$/, '');
  const ns = nsByPrefix.get(prefix);
  if (!ns) {
    log(`IGNORADO ${file} — prefixo "${prefix}" fora do registro (noos.registry.json)`);
    continue;
  }
  const text = await readFile(path.join(SRC_DIR, file), 'utf8');

  // mapa id -> linha real (1-based) para a proveniência da página —
  // construído com o MESMO parser, linha a linha (uma linha é um manifesto de 1)
  const lineOfId = new Map();
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].trim().length === 0) continue;
    const single = parseManifest(lines[li]);
    if (single.ok.length === 1) lineOfId.set(single.ok[0].id, li + 1);
  }

  const { ok, rejected } = parseManifest(text);
  for (const r of rejected) reject(file, r.lineNumber, null, r.reason);

  for (const record of ok) {
    const realLine = lineOfId.get(record.id) ?? 0;
    const vid = validateId(record.id);
    if (!vid.ok || vid.parsed.prefix !== prefix) {
      reject(file, realLine, record.id, `id fora do namespace do arquivo (${prefix})`);
      continue;
    }
    const dup = seenIds.get(record.id);
    if (dup !== undefined) {
      reject(file, realLine, record.id, `id duplicada — já ingerida em ${dup}`);
      continue;
    }
    if (!verifyChecksum(record)) {
      reject(file, realLine, record.id, 'checksum divergente — o conteúdo não corresponde à soma declarada');
      continue;
    }
    let aliasConflict = false;
    for (const a of record.aliases) {
      if (Object.prototype.hasOwnProperty.call(aliasMap, a)) {
        reject(file, realLine, record.id, `alias "${a}" já reivindicada pela questão ${aliasMap[a]} — alias é eterna e única`);
        aliasConflict = true;
      }
    }
    if (aliasConflict) continue;

    seenIds.set(record.id, `${file}:${realLine}`);
    for (const a of record.aliases) aliasMap[a] = record.id;
    accepted.push({ record, prefix, lineNumber: realLine, ns });
  }
}

log(
  manifestFiles.length === 0
    ? 'nenhum manifesto em manifestos/ — build verde, site inalterado (zero apps é estado normal)'
    : `manifestos: ${manifestFiles.length}; questões aceitas: ${accepted.length}; linhas rejeitadas: ${rejections.length}`,
);

// ---------- D1 (v12): gabarito por TEXTO, derivado do índice canônico
//
// `snapshot.answer` chega como LETRA ("B") na ordem canônica de
// `snapshot.options`. A página publica o TEXTO da alternativa correta — a
// letra do app pode ser outra (alternativas embaralhadas na sessão) e exibir
// a letra do hub é exatamente o incidente A/C. Letra fora de A–D (ou índice
// sem alternativa) é gabarito inválido: FALHA o build com id e motivo, em
// vez de publicar uma página com gabarito silenciosamente errado.

const ANSWER_LETTERS = 'ABCD';
/** Aceita letra ("B") OU o texto exato de uma alternativa (fixtures antigas). */
const resolveAnswerIndex = (options, answer) => {
  const trimmed = String(answer ?? '').trim();
  if (/^[A-Z]$/i.test(trimmed)) {
    const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  return options.findIndex((o) => String(o).trim() === trimmed);
};
const answerErrors = [];
for (const q of accepted) {
  const answer = q.record.snapshot.answer;
  const index = resolveAnswerIndex(q.record.snapshot.options, answer);
  if (index === -1) {
    answerErrors.push(
      `${q.record.id}: snapshot.answer ${JSON.stringify(answer)} não é letra A–D nem o texto de uma alternativa`,
    );
    continue;
  }
  q.answerIndex = index;
  q.answerLetter = ANSWER_LETTERS[index];
  const answerText = q.record.snapshot.options[index];
  if (typeof answerText !== 'string' || answerText.trim() === '') {
    answerErrors.push(
      `${q.record.id}: snapshot.answer "${letter}" aponta para options[${index}], mas a questão tem ${q.record.snapshot.options.length} alternativa(s)`,
    );
    continue;
  }
  q.answerText = answerText;
}
if (answerErrors.length > 0) {
  for (const error of answerErrors) console.error(`[gera-questoes] FALHA: ${error}`);
  console.error(
    `[gera-questoes] ${answerErrors.length} questão(ões) com gabarito inválido — build abortado, nenhuma página foi gerada.`,
  );
  process.exit(1);
}

// ---------- páginas

const tplPt = await readFile(path.join(ROOT, 'build', 'templates', 'questao-pt.html'), 'utf8');
const tplEn = await readFile(path.join(ROOT, 'build', 'templates', 'questao-en.html'), 'utf8');
const tplRdPt = await readFile(path.join(ROOT, 'build', 'templates', 'redirect-pt.html'), 'utf8');
const tplRdEn = await readFile(path.join(ROOT, 'build', 'templates', 'redirect-en.html'), 'utf8');

// Cada build reflete apenas os manifestos atuais; arquivos gerados antigos não podem sobreviver.
for (const dir of ['pt/q', 'en/q', 'q']) {
  await rm(path.join(OUT_DIR, dir), { recursive: true, force: true });
}

const ogDescription = (statement) =>
  escapeHtml(`${statement.replace(/\s+/g, ' ').trim().slice(0, 197)}…`);

const refBlock = (reference, lang) => {
  if (!reference) return '';
  const label = lang === 'pt' ? 'Referência' : 'Reference';
  const safe = escapeHtml(reference);
  if (/^https?:\/\//i.test(reference)) {
    return `<p class="q-ref"><strong>${label}:</strong> <a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></p>`;
  }
  return `<p class="q-ref"><strong>${label}:</strong> ${safe}</p>`;
};

const discussionsBlock = (id, lang) => {
  const d = registry.discussions;
  if (!d || !d.enabled || !d.repoId || !d.categoryId) return '';
  const label =
    lang === 'pt' ? 'Conversar sobre esta questão' : 'Discuss this question';
  return `<details class="q-talk">
          <summary>${escapeHtml(label)}</summary>
          <div class="giscus"></div>
          <script src="https://giscus.app/client.js"
            data-repo="${escapeHtml(d.repo)}"
            data-repo-id="${escapeHtml(d.repoId)}"
            data-category="${escapeHtml(d.category)}"
            data-category-id="${escapeHtml(d.categoryId)}"
            data-mapping="specific"
            data-term="${escapeHtml(id)}"
            data-reactions-enabled="${escapeHtml(String(d.react ?? 1))}"
            data-emit-metadata="0"
            data-input-position="bottom"
            data-theme="preferred_color_scheme"
            data-lang="${lang}"
            crossorigin="anonymous"
            async></script>
          <noscript><p class="q-talk-fallback">${escapeHtml(
            lang === 'pt'
              ? 'Ative o JavaScript para comentar ou abra as discussões no GitHub.'
              : 'Enable JavaScript to comment, or open the discussions on GitHub.',
          )}</p></noscript>
        </details>`;
};

const ctaBlock = (ns, lang) =>
  ns.url
    ? `<div class="q-cta"><a class="btn primary" href="${escapeHtml(ns.url)}" target="_blank" rel="noopener">${lang === 'pt' ? `Treinar esta prova no ${escapeHtml(ns.app)}` : `Train this exam on ${escapeHtml(ns.app)}`} <span class="arrow">→</span></a></div>`
    : '';

// ---------- A Camada de Mielina (discussão por questão) ----------
// Dados de discussão vêm de discussao/{PREFIX}.json (F2.1, dump estático).
// Sem dump: estado vazio orientador (regra estado-vazio) — nunca inventamos
// comentário/estatística em página real.

const discussaoCache = new Map();
function discussionFor(prefix) {
  if (!discussaoCache.has(prefix)) discussaoCache.set(prefix, loadDiscussao(ROOT, prefix, QA));
  return discussaoCache.get(prefix);
}

const tierNames = {
  pt: { 1: 'Sinapse', 2: 'Aprovado', 3: 'Mielina ativa', 4: 'Nó da Noosfera' },
  en: { 1: 'Synapse', 2: 'Passed', 3: 'Active myelin', 4: 'Noosphere node' },
};

const mielinaT = (lang) =>
  lang === 'pt'
    ? {
        title: 'A Camada de Mielina',
        sub: 'Discussão por questão — quem passou vira mielina para quem vem.',
        approved: 'aprovados contribuíram',
        matrix: 'Matriz de dissecção das alternativas',
        matrixHint: 'Clique numa alternativa para filtrar as contribuições.',
        answer: 'Gabarito',
        trap: 'Pegadinha mais debatida',
        synthesis: 'Síntese consolidada',
        synthesisEmpty:
          'Ainda não há síntese para esta questão. Se você passou na prova, inaugure a explicação revisável — com fonte oficial.',
        synthesisCta: 'Contribuir com a síntese',
        official: 'Âncora na documentação oficial',
        revision: 'Histórico / Diff',
        coauthors: 'Co-autoria',
        ritualTitle: 'Passei na prova!',
        ritualBody: 'Quem passou vira mielina para quem vem. Conte qual alternativa te confundiu e qual fonte oficial resolveu a dúvida.',
        ritualDismiss: 'Dispensar',
        filters: 'Filtrar contribuições',
        all: 'Todas',
        passed: 'Só aprovados',
        sources: 'Fontes oficiais',
        threadTitle: 'Contribuições dos pares',
        threadEmpty:
          'Nenhuma contribuição pública ainda. A primeira explicação com fonte oficial pode inaugurar esta camada.',
        accelerations: 'acelerações',
        accepted: 'Resposta aceita',
        source: 'Fonte',
        dynamic: 'Discussão dinâmica no GitHub',
        dynamicHint: 'O fio ao vivo abre no giscus; a síntese acima é o snapshot revisável.',
      }
    : {
        title: 'The Myelin Layer',
        sub: 'Per-question discussion — those who passed become myelin for those who follow.',
        approved: 'passed contributors',
        matrix: 'Answer distractor matrix',
        matrixHint: 'Click an option to filter the contributions.',
        answer: 'Answer',
        trap: 'Most debated trap',
        synthesis: 'Consolidated synthesis',
        synthesisEmpty:
          'No synthesis for this question yet. If you passed the exam, open the reviewable explanation — with an official source.',
        synthesisCta: 'Contribute to the synthesis',
        official: 'Official documentation anchor',
        revision: 'History / Diff',
        coauthors: 'Co-authorship',
        ritualTitle: 'I passed!',
        ritualBody: 'Those who passed become myelin for those who follow. Share the option that confused you and the official source that resolved it.',
        ritualDismiss: 'Dismiss',
        filters: 'Filter contributions',
        all: 'All',
        passed: 'Passed only',
        sources: 'Official sources',
        threadTitle: 'Peer contributions',
        threadEmpty: 'No public contribution yet. The first sourced explanation can open this layer.',
        accelerations: 'accelerations',
        accepted: 'Accepted answer',
        source: 'Source',
        dynamic: 'Live discussion on GitHub',
        dynamicHint: 'The live thread opens in giscus; the synthesis above is the reviewable snapshot.',
      };

const isSafeUrl = (u) => {
  try {
    return new URL(String(u)).protocol === 'https:';
  } catch {
    return false;
  }
};

const optionLetter = (i) => 'ABCD'[i] ?? '?';

function renderDiscussionHead(entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const approved = comments.filter((c) => c && c.passed === true).length;
  return `<header class="mielina-head">
            <p class="mono mielina-kicker">${escapeHtml(t.sub)}</p>
            <h2 id="mielina-title" class="mielina-title">${escapeHtml(t.title)}</h2>
            <p class="mielina-approved"><span class="mono">✦</span> ${approved} ${escapeHtml(t.approved)}</p>
          </header>`;
}

function renderMatrix(q, entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const c of comments) {
    const opt = String(c?.option ?? '').toUpperCase();
    if (counts[opt] !== undefined) counts[opt] += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const answerIdx = q.answerIndex ?? 0;
  const answer = optionLetter(answerIdx);
  let trap = null;
  for (const opt of ['A', 'B', 'C', 'D']) {
    if (opt === answer) continue;
    if (counts[opt] > 0 && (!trap || counts[opt] > counts[trap])) trap = opt;
  }
  const cell = (opt) => {
    const pct = total > 0 ? Math.round((counts[opt] / total) * 100) : 0;
    const cls = ['distractor-cell'];
    if (opt === answer) cls.push('is-answer');
    if (opt === trap) cls.push('is-trap');
    const tag =
      opt === answer
        ? `<span class="distractor-tag">${escapeHtml(t.answer)} ✓</span>`
        : opt === trap
          ? `<span class="distractor-tag">${escapeHtml(t.trap)}</span>`
          : '';
    return `<button type="button" class="${cls.join(' ')}" data-filter-opt="${opt}" aria-pressed="false">
              <span class="distractor-letter mono">${opt}</span>
              <span class="distractor-pct mono">${pct}%</span>
              ${tag}
              <span class="distractor-bar"><i style="width:${pct}%"></i></span>
            </button>`;
  };
  return `<section class="mielina-box" aria-labelledby="mielina-matrix-title">
            <h3 id="mielina-matrix-title" class="mielina-section-title">${escapeHtml(t.matrix)}</h3>
            <p class="mielina-hint">${escapeHtml(t.matrixHint)}</p>
            <div class="distractor-grid" role="group" aria-label="${escapeHtml(t.matrix)}">
              ${['A', 'B', 'C', 'D'].map(cell).join('\n              ')}
            </div>
          </section>`;
}

function renderSynthesis(q, entry, lang) {
  const t = mielinaT(lang);
  const syn = entry?.synthesis;
  const refUrl = String(q.record.snapshot.reference ?? '');
  const refLink = isSafeUrl(refUrl)
    ? `<a class="mielina-source" href="${escapeHtml(refUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(refUrl)}</a>`
    : '';
  const corners = `<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>`;
  if (!syn || typeof syn !== 'object') {
    return `<section class="mielina-box pinned" id="sintese-wiki" aria-labelledby="sintese-title">
            ${corners}
            <h3 id="sintese-title" class="mielina-section-title">${escapeHtml(t.synthesis)}</h3>
            <p class="mielina-empty">${escapeHtml(t.synthesisEmpty)}</p>
            <p class="mielina-official"><span class="mono">${escapeHtml(t.official)}</span> ${refLink}</p>
            <a class="mielina-chip" href="#discussao-dinamica">${escapeHtml(t.synthesisCta)} →</a>
          </section>`;
  }
  const summary = String(syn.summary ?? '').trim();
  const source = isSafeUrl(syn.sourceUrl) ? syn.sourceUrl : refUrl;
  const authors = Array.isArray(syn.authors) ? syn.authors.filter(Boolean).map(String) : [];
  return `<section class="mielina-box pinned" id="sintese-wiki" aria-labelledby="sintese-title">
            ${corners}
            <h3 id="sintese-title" class="mielina-section-title">${escapeHtml(t.synthesis)}</h3>
            <p class="mielina-summary">${escapeHtml(summary)}</p>
            <p class="mielina-official"><span class="mono">${escapeHtml(t.official)}</span> ${
              isSafeUrl(source)
                ? `<a class="mielina-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(syn.sourceTitle ?? source))}</a>`
                : ''
            }</p>
            <div class="mielina-wiki-foot">
              <span class="mono">${escapeHtml(t.coauthors)}: ${authors.map(escapeHtml).join(' · ') || '—'}</span>
              ${Number(syn.version) >= 2
                ? `<button class="mielina-chip" type="button" data-wiki-history disabled title="${escapeHtml(lang === 'pt' ? 'Histórico de revisões em breve' : 'Revision history coming soon')}">v${escapeHtml(String(syn.version))} · ${escapeHtml(t.revision)}</button>`
                : ''}
            </div>
          </section>`;
}

function renderRitual(lang) {
  const t = mielinaT(lang);
  return `<aside class="mielina-ritual" id="ritual-passei" data-ritual hidden aria-label="${escapeHtml(t.ritualTitle)}">
            <p class="mono mielina-kicker">✦ ${escapeHtml(t.ritualTitle)}</p>
            <p>${escapeHtml(t.ritualBody)}</p>
            <button type="button" class="mielina-chip" data-ritual-dismiss>${escapeHtml(t.ritualDismiss)} ×</button>
          </aside>`;
}

function renderFilters(lang) {
  const t = mielinaT(lang);
  const chips = [
    { key: 'all', label: t.all, pressed: true },
    { key: 'passed', label: `✦ ${t.passed}`, pressed: false },
    { key: 'source', label: t.sources, pressed: false },
  ];
  return `<div class="mielina-filters" role="group" aria-label="${escapeHtml(t.filters)}">
            ${chips
              .map(
                (c) =>
                  `<button type="button" class="mielina-chip" data-filter="${c.key}" aria-pressed="${c.pressed}">${escapeHtml(c.label)}</button>`,
              )
              .join('\n            ')}
          </div>`;
}

function renderThread(entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments.filter((c) => c && typeof c === 'object') : [];
  const head = `<h3 class="mielina-section-title" id="mielina-thread-title">${escapeHtml(t.threadTitle)}</h3>`;
  if (comments.length === 0) {
    return `<section class="mielina-box" aria-labelledby="mielina-thread-title">
            ${head}
            <p class="mielina-empty">${escapeHtml(t.threadEmpty)}</p>
          </section>`;
  }
  const cards = comments
    .slice()
    .sort((a, b) => (b.accepted === true) - (a.accepted === true) || (Number(b.accelerations) || 0) - (Number(a.accelerations) || 0))
    .map((c) => {
      const tier = Math.min(4, Math.max(1, Number(c.tier) || 1));
      const handle = String(c.handle ?? '@anon').trim();
      const body = String(c.body ?? '').trim();
      const opt = String(c.option ?? '').toUpperCase();
      const source = isSafeUrl(c.sourceUrl) ? c.sourceUrl : null;
      const accel = Number(c.accelerations) || 0;
      const approved = c.passed === true;
      const badges = [
        approved ? `<span class="badge-passed">✦ ${escapeHtml(lang === 'pt' ? 'Passei na prova' : 'Passed')}</span>` : '',
        `<span class="badge-role">${escapeHtml(tierNames[lang][tier] ?? '')}</span>`,
        c.accepted === true ? `<span class="badge-role">✓ ${escapeHtml(t.accepted)}</span>` : '',
        opt ? `<span class="badge-trap">${escapeHtml(lang === 'pt' ? 'Alternativa' : 'Option')} ${escapeHtml(opt)}</span>` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<article class="mielina-card" data-opt="${escapeHtml(opt)}" data-passed="${approved ? '1' : '0'}" data-source="${source ? '1' : '0'}">
              <header class="mielina-card-head">
                ${renderNoosAvatarSvg(handle, tier)}
                <div class="mielina-card-id">
                  <span class="mielina-handle mono">${escapeHtml(handle)}</span>
                  <span class="mielina-badges">${badges}</span>
                </div>
                <span class="mielina-accel mono">▲ ${accel} ${escapeHtml(t.accelerations)}</span>
              </header>
              <p class="mielina-card-body">${escapeHtml(body)}</p>
              ${source ? `<p class="mielina-official"><span class="mono">${escapeHtml(t.source)}</span> <a class="mielina-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source)}</a></p>` : ''}
            </article>`;
    });
  return `<section class="mielina-thread" aria-labelledby="mielina-thread-title">
            ${head}
            ${cards.join('\n            ')}
          </section>`;
}

const langNote = (recordLang, pageLang) => {
  if (pageLang === 'pt' && !/^pt\b/i.test(recordLang))
    return `<span class="q-lang-note">A questão está em ${escapeHtml(recordLang)}.</span>`;
  if (pageLang === 'en' && !/^en\b/i.test(recordLang))
    return `<span class="q-lang-note">This question is in ${escapeHtml(recordLang)}.</span>`;
  return '';
};

const commonMap = (q, lang) => {
  const r = q.record;
  const entry = discussionFor(q.prefix).byId.get(r.id) ?? null;
  return {
    ID: escapeHtml(r.id),
    APP_NAME: escapeHtml(q.ns.app),
    APP_COLOR: escapeHtml(q.ns.color ?? 'var(--accent)'),
    EXAM: escapeHtml(r.exam),
    TOPICS: r.topics.map(escapeHtml).join(' · '),
    DIFFICULTY: escapeHtml(r.difficulty),
    LANG_NOTE: langNote(r.lang, lang),
    STATEMENT: escapeHtml(r.snapshot.statement),
    OPTIONS: r.snapshot.options.map((o) => `<li>${escapeHtml(o)}</li>`).join('\n        '),
    DISCUSSION_HEAD: renderDiscussionHead(entry, lang),
    DISCUSSION_MATRIX: renderMatrix(q, entry, lang),
    DISCUSSION_SYNTHESIS: renderSynthesis(q, entry, lang),
    RITUAL_BANNER: renderRitual(lang),
    DISCUSSION_FILTERS: renderFilters(lang),
    DISCUSSION_THREAD: renderThread(entry, lang),
    DISCUSSIONS_BLOCK: discussionsBlock(r.id, lang),
    ANSWER_BLOCK: isRetired(r)
      ? ''
      : `<details class="q-answer">
          <summary>${lang === 'pt' ? 'Revelar gabarito' : 'Reveal answer'}</summary>
          <p><strong>${lang === 'pt' ? 'Resposta correta:' : 'Correct answer:'}</strong> ${escapeHtml(q.answerText)}</p>
          ${refBlock(r.snapshot.reference, lang)}
        </details>`,
    RETIRED_BANNER: isRetired(r)
      ? `<aside class="q-retired"><p>${escapeHtml(
          lang === 'pt'
            ? 'Questão retirada do banco ativo — mantida por citação. O texto permanece publicado para que links antigos continuem válidos.'
            : 'Question retired from the active bank — kept for citation. The text remains published so older links keep working.',
        )}</p></aside>`
      : '',
    VERSION: escapeHtml(String(r.version)),
    CHECKSUM: escapeHtml(r.checksum),
    ALIASES: r.aliases.length ? r.aliases.map(escapeHtml).join(' · ') : '—',
    LINE: String(q.lineNumber),
    PREFIX: escapeHtml(q.prefix),
    SYSTEM_VERSION: escapeHtml(registry.version),
    BUILD_DATE: lang === 'pt' ? `build ${BUILD_PT}` : `build ${BUILD_EN}`,
    CANONICAL_URL: `https://noos.study/${lang}/q/${r.id}/`,
    OG_DESCRIPTION: ogDescription(r.snapshot.statement),
    APP_URL_BLOCK: ctaBlock(q.ns, lang),
  };
};

let pagesWritten = 0;
for (const q of accepted) {
  const dirPt = path.join(OUT_DIR, 'pt', 'q', q.record.id);
  const dirEn = path.join(OUT_DIR, 'en', 'q', q.record.id);
  await mkdir(dirPt, { recursive: true });
  await mkdir(dirEn, { recursive: true });
  await writeFile(path.join(dirPt, 'index.html'), fill(tplPt, commonMap(q, 'pt')));
  await writeFile(path.join(dirEn, 'index.html'), fill(tplEn, commonMap(q, 'en')));
  pagesWritten += 2;
}

// par PT/EN sempre — a escrita acima já lança em falha; a checagem é a
// prova explícita exigida pela aceitação da spec.
for (const q of accepted) {
  const ptOk = existsSync(path.join(OUT_DIR, 'pt', 'q', q.record.id, 'index.html'));
  const enOk = existsSync(path.join(OUT_DIR, 'en', 'q', q.record.id, 'index.html'));
  if (!ptOk || !enOk) {
    console.error(`[gera-questoes] FALHA: par PT/EN incompleto para ${q.record.id}`);
    process.exit(1);
  }
}

// ---------- páginas de redirect (plano C — alias e forma sem idioma)
//
// Sem rewrites e sem função: TODO o roteamento da /q/{ID} é arquivo
// estático. A alias resolve em salto único — o destino já é a canônica na
// mesma língua; a forma sem idioma aponta direto para /pt/q/{resolvida}/.


// path normalizado (com barras) -> destino relativo; colisão = build falha
const redirects = new Map();
const addRedirect = (from, dest) => {
  const norm = `/${from.replace(/^\/+|\/+$/g, '')}/`;
  const existing = redirects.get(norm);
  if (existing !== undefined && existing !== dest) {
    console.error(
      `[gera-questoes] FALHA: colisão de redirect em ${norm} — "${dest}" vs "${existing}" (alias igual a canônica de outra questão, ou alias reivindicada duas vezes)`,
    );
    process.exit(1);
  }
  redirects.set(norm, dest);
};

for (const q of accepted) {
  const id = q.record.id;
  addRedirect(`q/${id}`, `/pt/q/${id}/`); // sem idioma → PT
  for (const a of q.record.aliases) {
    addRedirect(`pt/q/${a}`, `/pt/q/${id}/`); // alias na mesma língua
    addRedirect(`en/q/${a}`, `/en/q/${id}/`);
    addRedirect(`q/${a}`, `/pt/q/${id}/`); // sem idioma + alias = salto único
  }
}

let redirectsWritten = 0;
for (const [fromPath, destPath] of redirects) {
  const isEn = fromPath.startsWith('/en/');
  const fromId = fromPath.split('/').filter(Boolean).pop();
  const dir = path.join(OUT_DIR, fromPath);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'index.html'),
    fill(isEn ? tplRdEn : tplRdPt, {
      FROM_ID: escapeHtml(fromId),
      DESTINY_PATH: escapeHtml(destPath),
      CANONICAL_URL: `https://noos.study${destPath}`,
    }),
  );
  redirectsWritten++;
}

// ---------- sitemap.xml (base + uma entrada por questão — só canônicas)

const sitemapBase = await readFile(path.join(ROOT, 'build', 'templates', 'sitemap-base.xml'), 'utf8');
const entries = accepted
  .map(
    (q) => `  <url>
    <loc>https://noos.study/pt/q/${q.record.id}/</loc>
    <xhtml:link rel="alternate" hreflang="pt" href="https://noos.study/pt/q/${q.record.id}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://noos.study/en/q/${q.record.id}/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://noos.study/pt/q/${q.record.id}/"/>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`,
  )
  .join('');
await writeFile(
  path.join(OUT_DIR, 'sitemap.xml'),
  sitemapBase.replace('</urlset>', `${entries}</urlset>`),
);

log(
  `saídas: ${pagesWritten} página(s) de questão, ${redirectsWritten} página(s) de redirect (aliases + forma sem idioma), sitemap.xml (${entries ? 'base + questões' : 'igual à base'})`,
);

// ---------- modo --qa: asserções da aceitação (spec-pagina-de-questao.md)

if (QA) {
  const failures = [];
  const expect = (cond, label) => {
    console.log(`[qa] ${cond ? 'PASS' : 'FAIL'} — ${label}`);
    if (!cond) failures.push(label);
  };

  // fixture esperado: 2 aceitas (RAN-AZ900-00042 ativa + RAN-AZ900-00044 retirada),
  // 2 rejeitadas (checksum + JSON)
  expect(accepted.length === 2, `2 questões aceitas (veio ${accepted.length})`);
  expect(
    rejections.length === 2 && rejections.every((r) => r.file === 'RAN.jsonl'),
    `2 linhas rejeitadas com log (veio ${rejections.length})`,
  );
  expect(
    accepted[0]?.record.id === 'RAN-AZ900-00042',
    'a ativa é a RAN-AZ900-00042 (exemplo trabalhado do guia)',
  );
  expect(
    accepted.some((q) => q.record.id === 'RAN-AZ900-00044' && isRetired(q.record)),
    'a retirada é a RAN-AZ900-00044 (campo retired)',
  );

  // páginas em par
  const ptPage = path.join(OUT_DIR, 'pt', 'q', 'RAN-AZ900-00042', 'index.html');
  const enPage = path.join(OUT_DIR, 'en', 'q', 'RAN-AZ900-00042', 'index.html');
  expect(existsSync(ptPage) && existsSync(enPage), 'par PT/EN gerado');
  const ptHtml = existsSync(ptPage) ? await readFile(ptPage, 'utf8') : '';
  const enHtml = existsSync(enPage) ? await readFile(enPage, 'utf8') : '';

  // escape e conteúdo
  expect(ptHtml.includes('nº 42 da prova AZ-900'), 'enunciado presente na página PT');
  expect(ptHtml.includes('<details class="q-answer">'), 'gabarito em <details> (fechado por padrão)');
  if (registry.discussions?.enabled) {
    expect(ptHtml.includes('giscus.app/client.js'), 'discussões ligadas: bloco giscus presente na página canônica');
    expect(ptHtml.includes(`data-term="${accepted[0].record.id}"`), 'giscus usa term = ID público (uma conversa por questão)');
    expect(!existsSync(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html')) || !(await readFile(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html'), 'utf8')).includes('giscus'), 'alias/redirect não recebem bloco de discussão');
  } else {
    expect(!ptHtml.includes('giscus.app'), 'discussões desligadas por padrão (sem giscus até o app ser instalado)');
  }
  expect(
    ptHtml.includes('sha256:da215a61f90cc5a363c6c49cf50f592a000587cbe38f55ef3a5d1c6ff2b036a7'),
    'checksum completo na proveniência',
  );
  expect(ptHtml.includes('manifestos/RAN.jsonl'), 'link para o manifesto na proveniência');
  expect(ptHtml.includes('GLI-AZ900-00012'), 'alias legada listada');
  expect(ptHtml.includes('Treinar esta prova no Ranvier'), 'volta ao app presente (registry com url)');
  expect(ptHtml.includes(`Sistema Noos v${registry.version}`), 'rodapé PT = versão do registry');
  expect(enHtml.includes('Train this exam on Ranvier'), 'volta ao app presente na EN');
  expect(enHtml.includes(`Noos system v${registry.version}`), 'rodapé EN = versão do registry');
  expect(enHtml.includes('This question is in pt-BR.'), 'nota de idioma da questão na página EN');
  // ---- A Camada de Mielina (v2) — estrutura e dados do fixture ----
  expect(ptHtml.includes('class="q-grid"'), 'layout dual-column presente');
  expect((ptHtml.match(/class="distractor-cell/g) || []).length === 4, 'matriz de dissecção: 4 células');
  expect(ptHtml.includes('class="distractor-cell is-answer"'), 'matriz marca a alternativa do gabarito');
  expect(ptHtml.includes('class="distractor-cell is-trap"'), 'matriz marca a pegadinha mais debatida');
  expect(ptHtml.includes('id="sintese-wiki"'), 'síntese consolidada presente');
  expect(ptHtml.includes('noos-identicon tier-3'), 'avatar identicon com tier de reputação');
  expect(ptHtml.includes('Passei na prova'), 'flair de aprovado presente');
  expect(ptHtml.includes('data-filter-opt="B"'), 'âncora de discussão por alternativa');
  expect(!ptHtml.includes('by Noos'), 'zero "by Noos" na discussão');
  const retiredHtml = existsSync(path.join(OUT_DIR, 'pt', 'q', 'RAN-AZ900-00044', 'index.html'))
    ? await readFile(path.join(OUT_DIR, 'pt', 'q', 'RAN-AZ900-00044', 'index.html'), 'utf8')
    : '';
  expect(retiredHtml.includes('class="mielina-empty"'), 'estado vazio orientador em questão sem discussão');
  const aliasHtml = existsSync(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html'))
    ? await readFile(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html'), 'utf8')
    : '';
  expect(!aliasHtml.includes('mielina-card'), 'alias não recebe a camada de discussão');


  // D3 (v12): assert de PARIDADE — para CADA record aceito e CADA idioma, a
  // página mostra o TEXTO de options[índice] (nunca a letra isolada como
  // gabarito) e as alternativas continuam na ordem canônica. Divergência
  // falha o QA com o id e o motivo — é o guarda contra o incidente A/C.
  const answerLabel = { pt: 'Resposta correta:', en: 'Correct answer:' };
  for (const q of accepted) {
    const id = q.record.id;
    if (isRetired(q.record)) {
      for (const lang of ['pt', 'en']) {
        const pagePath = path.join(OUT_DIR, lang, 'q', id, 'index.html');
        const html = existsSync(pagePath) ? await readFile(pagePath, 'utf8') : '';
        expect(html.includes('class="q-retired"'), `retirada ${lang} ${id}: aviso de questão retirada presente`);
        expect(
          !html.includes('<details class="q-answer">'),
          `retirada ${lang} ${id}: sem gabarito interativo`,
        );
      }
      continue;
    }
    const letter = q.record.snapshot.answer;
    const index = 'ABCD'.indexOf(letter);
    const expectedText = q.record.snapshot.options[index];
    for (const lang of ['pt', 'en']) {
      const pagePath = path.join(OUT_DIR, lang, 'q', id, 'index.html');
      const html = existsSync(pagePath) ? await readFile(pagePath, 'utf8') : '';
      expect(
        html.includes(`<strong>${answerLabel[lang]}</strong> ${escapeHtml(expectedText)}`),
        `paridade ${lang} ${id}: gabarito mostra o texto de options[${index}] (letra canônica ${letter})`,
      );
      expect(
        !html.includes(`<strong>${answerLabel[lang]}</strong> ${q.record.snapshot.answer}</p>`),
        `paridade ${lang} ${id}: gabarito não exibe a letra isolada`,
      );
      let cursor = -1;
      const ordered = q.record.snapshot.options.every((option) => {
        const at = html.indexOf(`<li>${escapeHtml(option)}</li>`);
        if (at === -1 || at < cursor) return false;
        cursor = at;
        return true;
      });
      expect(ordered, `paridade ${lang} ${id}: alternativas na ordem canônica (letras A–D do <ol> rotulam a ordem, não o acerto)`);
    }
  }

  // páginas de redirect (plano C — alias e forma sem idioma)
  const rdPt = path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html');
  const rdEn = path.join(OUT_DIR, 'en', 'q', 'GLI-AZ900-00012', 'index.html');
  const rdNoLang = path.join(OUT_DIR, 'q', 'RAN-AZ900-00042', 'index.html');
  const rdNoLangAlias = path.join(OUT_DIR, 'q', 'GLI-AZ900-00012', 'index.html');
  expect(existsSync(rdPt) && existsSync(rdEn), 'páginas de redirect da alias PT/EN geradas');
  const rdPtHtml = existsSync(rdPt) ? await readFile(rdPt, 'utf8') : '';
  expect(
    rdPtHtml.includes('content="0; url=/pt/q/RAN-AZ900-00042/"'),
    'alias PT redireciona para a canônica na mesma língua',
  );
  expect(
    rdPtHtml.includes('rel="canonical" href="https://noos.study/pt/q/RAN-AZ900-00042/"'),
    'canonical da página de alias aponta para a canônica',
  );
  expect(rdPtHtml.includes('noindex'), 'página de alias é noindex');
  expect(!rdPtHtml.includes('<details'), 'página de alias não é página de conteúdo (sem gabarito)');
  const rdEnHtml = existsSync(rdEn) ? await readFile(rdEn, 'utf8') : '';
  expect(
    rdEnHtml.includes('content="0; url=/en/q/RAN-AZ900-00042/"'),
    'alias EN redireciona para a canônica EN',
  );
  expect(existsSync(rdNoLang), 'forma sem idioma da canônica gerada');
  const rdNoLangHtml = existsSync(rdNoLang) ? await readFile(rdNoLang, 'utf8') : '';
  expect(
    rdNoLangHtml.includes('content="0; url=/pt/q/RAN-AZ900-00042/"'),
    'forma sem idioma resolve para PT',
  );
  expect(existsSync(rdNoLangAlias), 'forma sem idioma da alias gerada');
  const rdNoLangAliasHtml = existsSync(rdNoLangAlias) ? await readFile(rdNoLangAlias, 'utf8') : '';
  expect(
    rdNoLangAliasHtml.includes('content="0; url=/pt/q/RAN-AZ900-00042/"'),
    'alias sem idioma resolve em salto único (destino já é a canônica)',
  );
  expect(
    !existsSync(path.join(OUT_DIR, 'pt', 'q', 'RAN-AZ900-00043', 'index.html')) &&
      !existsSync(path.join(OUT_DIR, 'q', 'RAN-AZ900-00043', 'index.html')),
    'linha com checksum divergente não gerou página NEM redirect',
  );

  // sitemap
  const sitemap = await readFile(path.join(OUT_DIR, 'sitemap.xml'), 'utf8');
  expect(sitemap.includes('https://noos.study/pt/q/RAN-AZ900-00042/'), 'sitemap: entrada PT da questão');
  expect(sitemap.includes('https://noos.study/en/q/RAN-AZ900-00042/'), 'sitemap: entrada EN da questão');
  expect(
    sitemap.includes('https://noos.study/pt/q/RAN-AZ900-00044/'),
    'sitemap: questão retirada continua citável',
  );
  expect(!sitemap.includes('GLI-'), 'sitemap não lista alias (só canônicas)');

  console.log(`\n[qa] ${failures.length === 0 ? 'PASS — fixture conforme a spec' : `FAIL (${failures.length})`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}
