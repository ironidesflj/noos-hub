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

// Opção A (100% Camada de Mielina nativa): sem iframe Giscus na página.
// A persistência usa o GitHub Discussions como backend estático via Compositor Guiado + sync-discussao.mjs.
const discussionsBlock = (_id, _lang) => '';

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
        title: 'Onde a prova tenta te enganar — e como quem passou resolveu.',
        sub: '02 — Camada de Mielina · Discussão Canônica',
        approved: 'Aprovados',
        approvedSub: 'contribuíram nesta questão',
        matrix: 'Matriz de Dissecção de Alternativas',
        matrixHint: 'Clique numa alternativa para filtrar ou inaugurar a dissecção.',
        answer: 'Gabarito',
        trap: 'Pegadinha mais debatida',
        dissect: 'Dissecar',
        synthesis: '✦ Síntese Consolidada (Wiki)',
        synthesisEmpty:
          'Ainda não há síntese comunitária consolidada para esta questão. Abaixo está o ponto de partida oficial verificável — se você passou na prova, inaugure a dissecção das alternativas.',
        synthesisCta: 'Inaugurar síntese desta questão',
        official: '⚓ Ancorado na Fonte Oficial:',
        revision: 'Histórico / Diff',
        coauthors: 'Co-autores',
        ritualTitle: 'PASSEI!',
        ritualQuote: '“Quem passou vira mielina para quem vem.”',
        ritualBody:
          'Esta questão foi aberta pelo Ritual Pós-Prova. Ao explicar abaixo qual pegadinha te confundiu e qual palavra-chave destravou a resposta, seu Identicon ativa o Anel Nível 2 (✦ Aprovado).',
        ritualDismiss: 'Dispensar (zero nag)',
        filters: 'Filtrar contribuições',
        all: 'Todas',
        passed: 'Só Aprovados',
        sources: 'Fontes Oficiais',
        howHug: 'Como ganhar o Abraço da Esfera?',
        threadTitle: 'Contribuições dos pares',
        threadEmpty:
          'Nenhuma contribuição pública ainda. Seja o primeiro aprovado a explicar por que as alternativas incorretas enganam — sua contribuição constrói sua Bainha Orbital.',
        accelerations: 'acelerações',
        accelerateBtn: 'Acelerou meu estudo',
        accepted: 'Co-autor Wiki',
        source: '⚓ Fonte:',
        dynamic: 'Discussão dinâmica no GitHub',
        dynamicHint: 'O fio ao vivo sincroniza via GitHub Discussions (giscus); a síntese acima é o snapshot revisável sob CC BY-SA 4.0.',
        composerTitle: 'Contribuir com a Questão',
        composerSub: 'Sua contribuição constrói sua Bainha Orbital',
        composerOpt: '1. Onde está o ponto de dificuldade?',
        composerFlair: '2. Seu momento na prova (Flair)',
        composerFlairPassed: '✦ Passei na prova! (Ativa Anel Nível 2)',
        composerFlairStudy: 'Estudando agora (Nível 1 · Sinapse)',
        composerBody: '3. O que a documentação oficial não te conta de primeira?',
        composerBodyPlaceholder: 'Explique onde você travou e qual palavra-chave do enunciado destrava a resposta...',
        composerSourcePlaceholder: '⚓ Fonte oficial verificável (https://... ou seção do guia)',
        composerPublish: 'Publicar na Noosfera (CC BY-SA)',
        composerMissing: 'Escreva ao menos uma frase explicando o raciocínio.',
        composerBadUrl: 'Se informar URL, use https:// (ou deixe a referência oficial).',
        composerReady: 'Publicado localmente! Abrindo sincronização no GitHub Discussions…',
        gravityLabel: 'Gravidade da Família Noos · Conexão Entre Domínios',
        gravityCta: 'Explorar questão irmã →',
      }
    : {
        title: 'Where the exam tries to trick you — and how those who passed solved it.',
        sub: '02 — The Myelin Layer · Canonical Discussion',
        approved: 'Passed',
        approvedSub: 'contributed to this question',
        matrix: 'Answer Distractor Matrix',
        matrixHint: 'Click an option to filter or open its dissection.',
        answer: 'Answer',
        trap: 'Most debated trap',
        dissect: 'Dissect',
        synthesis: '✦ Consolidated Synthesis (Wiki)',
        synthesisEmpty:
          'No community synthesis consolidated for this question yet. Below is the verifiable official starting point — if you passed the exam, open the option dissection.',
        synthesisCta: 'Start synthesis for this question',
        official: '⚓ Official Documentation Anchor:',
        revision: 'History / Diff',
        coauthors: 'Co-authors',
        ritualTitle: 'I PASSED!',
        ritualQuote: '“Those who passed become myelin for those who follow.”',
        ritualBody:
          'Opened via the Post-Exam Ritual. Explain which trap confused you and which keyword unlocked the answer to activate your Tier 2 Ring (✦ Passed).',
        ritualDismiss: 'Dismiss (zero nag)',
        filters: 'Filter contributions',
        all: 'All',
        passed: 'Passed Only',
        sources: 'Official Sources',
        howHug: 'How to earn the Sphere Embrace?',
        threadTitle: 'Peer contributions',
        threadEmpty:
          'No public contribution yet. Be the first who passed to explain why the distractors trick candidates — your contribution builds your Orbital Sheath.',
        accelerations: 'accelerations',
        accelerateBtn: 'Accelerated my study',
        accepted: 'Wiki Co-author',
        source: '⚓ Source:',
        dynamic: 'Live discussion on GitHub',
        dynamicHint: 'The live thread syncs via GitHub Discussions (giscus); the synthesis above is the CC BY-SA 4.0 reviewable snapshot.',
        composerTitle: 'Contribute to this Question',
        composerSub: 'Your contribution builds your Orbital Sheath',
        composerOpt: '1. Where is the sticking point?',
        composerFlair: '2. Your exam status (Flair)',
        composerFlairPassed: '✦ I passed the exam! (Unlocks Tier 2 Ring)',
        composerFlairStudy: 'Studying now (Tier 1 · Synapse)',
        composerBody: '3. What does the official documentation not tell you up front?',
        composerBodyPlaceholder: 'Explain where you got stuck and which keyword in the stem unlocks the answer...',
        composerSourcePlaceholder: '⚓ Verifiable official source (https://... or guide section)',
        composerPublish: 'Publish to the Noosphere (CC BY-SA)',
        composerMissing: 'Write at least one sentence explaining the reasoning.',
        composerBadUrl: 'If providing a URL, it must start with https://.',
        composerReady: 'Published locally! Opening GitHub Discussions sync…',
        gravityLabel: 'Noos Family Gravity · Cross-Domain Connection',
        gravityCta: 'Explore sibling question →',
      };

const isSafeUrl = (u) => {
  try {
    return new URL(String(u)).protocol === 'https:';
  } catch {
    return false;
  }
};

const optionLetter = (i) => 'ABCD'[i] ?? '?';

const shortWords = (s, max = 28) => {
  const clean = String(s ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

function renderTiersDrawer(lang) {
  const isPt = lang === 'pt';
  return `<section class="mielina-tiers-drawer" id="tiers-showcase" data-tiers-drawer hidden aria-label="${isPt ? 'Os 4 Níveis do Abraço da Esfera' : 'The 4 Tiers of the Sphere Embrace'}">
            <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px">
              <div>
                <p class="mielina-kicker" style="color:var(--accent)">${isPt ? 'Reconhecimento Visual & Funcional Noos' : 'Noos Visual & Functional Recognition'}</p>
                <h3 class="mielina-title" style="font-size:21px">${
                  isPt
                    ? 'O “Abraço da Esfera”: <em>como o Noos abraça quem mais ajuda sem usar mascote infantil.</em>'
                    : 'The “Sphere Embrace”: <em>how Noos embraces top contributors without a childish mascot.</em>'
                }</h3>
                <p style="font-size:12px;color:var(--muted);margin-top:4px;max-width:72ch">${
                  isPt
                    ? 'Na neurobiologia, os oligodendrócitos abraçam o axônio com camadas de mielina para acelerar o impulso nervoso. No Noos, conforme suas explicações recebem votos e entram na Síntese Wiki, a Esfera Noos envolve seu Identicon com órbitas keplerianas e dois nós quânticos nos ombros do avatar.'
                    : 'In neurobiology, glial cells wrap axons in myelin sheaths to accelerate neural impulses. On Noos, as your explanations earn accelerations and enter the Wiki Synthesis, the Noos Sphere wraps your Identicon with Keplerian orbits and two quantum nodes on its shoulders.'
                }</p>
              </div>
              <button type="button" class="mielina-chip" data-tiers-close>${isPt ? 'Fechar ×' : 'Close ×'}</button>
            </div>
            <div class="mielina-tiers-grid">
              <div class="tier-card">
                <div>
                  <div class="tier-card-top">
                    <span style="color:var(--muted)">${isPt ? 'NÍVEL 01 · SINAPSE' : 'TIER 01 · SYNAPSE'}</span>
                    <span style="color:var(--muted)">${isPt ? '1+ contribuição' : '1+ contribution'}</span>
                  </div>
                  <div class="tier-card-mid">
                    ${renderNoosAvatarSvg('@lucas-dev', 1)}
                    <div>
                      <div class="mielina-handle">@lucas-dev</div>
                      <span class="badge-role" style="margin-top:3px">${isPt ? 'Estudando agora' : 'Studying now'}</span>
                    </div>
                  </div>
                  <p class="tier-card-desc">${isPt ? 'Identicon geométrico 5×5 (sem foto pessoal, zero rastreio). Moldura de 1px.' : 'Pure 5×5 geometric Identicon (no personal photo, zero tracking). 1px frame.'}</p>
                </div>
                <div class="tier-card-unlock" style="color:var(--muted)">🔓 ${isPt ? 'Poder: Comentar e votar ("Acelerou meu estudo").' : 'Unlocks: Commenting and voting ("Accelerated my study").'}</div>
              </div>
              <div class="tier-card">
                <div>
                  <div class="tier-card-top">
                    <span style="color:var(--accent)">${isPt ? 'NÍVEL 02 · APROVADO' : 'TIER 02 · PASSED'}</span>
                    <span style="color:var(--accent)">${isPt ? 'Ritual Pós-Prova' : 'Post-Exam Ritual'}</span>
                  </div>
                  <div class="tier-card-mid">
                    ${renderNoosAvatarSvg('@rafael-ops', 2)}
                    <div>
                      <div class="mielina-handle">@rafael-ops</div>
                      <span class="badge-passed" style="margin-top:3px">✦ ${isPt ? 'PASSEI NA PROVA' : 'PASSED EXAM'}</span>
                    </div>
                  </div>
                  <p class="tier-card-desc">${isPt ? 'Órbita tracejada única com 1 nó polar brilhante no ápice. Destaca quem enfrentou a prova real.' : 'Single dashed orbit with 1 bright polar node at the apex. Highlights those who passed the exam.'}</p>
                </div>
                <div class="tier-card-unlock">🔓 ${isPt ? 'Poder: Entra no filtro "✦ Só Aprovados" + placar do Hub.' : 'Unlocks: "✦ Passed Only" filter + Hub scoreboard.'}</div>
              </div>
              <div class="tier-card">
                <div>
                  <div class="tier-card-top">
                    <span style="color:var(--accent)">${isPt ? 'NÍVEL 03 · MIELINA ATIVA' : 'TIER 03 · ACTIVE MYELIN'}</span>
                    <span style="color:var(--muted)">25+ ${isPt ? 'acelerações' : 'accelerations'}</span>
                  </div>
                  <div class="tier-card-mid">
                    ${renderNoosAvatarSvg('@helena-qa-2b', 3)}
                    <div>
                      <div class="mielina-handle">@helena-qa-2b</div>
                      <span class="badge-role" style="margin-top:3px">⚡ ${isPt ? 'Mielina Ativa · Edita Wiki' : 'Active Myelin · Wiki Editor'}</span>
                    </div>
                  </div>
                  <p class="tier-card-desc">${isPt ? 'Duas elipses coaxiais (±35°) abraçam o avatar com dois nós laterais.' : 'Two coaxial ellipses (±35°) wrap the avatar with two lateral nodes.'}</p>
                </div>
                <div class="tier-card-unlock">🔓 ${isPt ? 'Poder: Gate Stack Overflow — edita a Síntese Wiki.' : 'Unlocks: Stack Overflow Gate — edits the Wiki Synthesis.'}</div>
              </div>
              <div class="tier-card is-hug corner-box">
                <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
                <div>
                  <div class="tier-card-top">
                    <span style="color:var(--signal);font-weight:600">${isPt ? 'NÍVEL 04 · ABRAÇO DA ESFERA' : 'TIER 04 · SPHERE EMBRACE'}</span>
                    <span style="color:var(--signal)">3+ ${isPt ? 'Sínteses Wiki' : 'Wiki Syntheses'}</span>
                  </div>
                  <div class="tier-card-mid">
                    ${renderNoosAvatarSvg('@vitor-cloud-9f', 4)}
                    <div>
                      <div class="mielina-handle">@vitor-cloud-9f</div>
                      <span class="badge-trap" style="margin-top:3px">🛡️ ${isPt ? 'Nó da Noosfera · Guardião' : 'Noosphere Node · Guardian'}</span>
                    </div>
                  </div>
                  <p class="tier-card-desc" style="color:var(--fg)"><strong>${isPt ? 'O Abraço da Esfera:' : 'The Sphere Embrace:'}</strong> ${isPt ? 'O capuz da Esfera Noos envolve o topo do Identicon e apoia dois nós luminosos nos ombros do perfil.' : 'The Noos Sphere hood wraps the top of the Identicon and rests two luminous nodes on its shoulders.'}</p>
                </div>
                <div class="tier-card-unlock" style="color:var(--signal)">🔓 ${isPt ? 'Poder: Aprovar/Reverter Diffs Wiki + Selo Co-autor.' : 'Unlocks: Approve/Revert Wiki Diffs + Co-author Badge.'}</div>
              </div>
            </div>
          </section>`;
}

function renderDiscussionHead(q, entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const approved = comments.filter((c) => c && c.passed === true).length;
  return `<div class="mielina-box">
            <header class="mielina-head-top">
              <div style="flex:1;min-width:220px">
                <p class="mielina-kicker">${escapeHtml(t.sub)}</p>
                <h2 id="mielina-title" class="mielina-title">${
                  lang === 'pt'
                    ? 'Onde a prova tenta te enganar — <em>e como quem passou resolveu.</em>'
                    : 'Where the exam tries to trick you — <em>and how those who passed solved it.</em>'
                }</h2>
              </div>
              <div class="mielina-scoreboard">
                <div class="mielina-score-row">
                  <span class="mielina-score-num" data-approved-count>${approved}</span>
                  <span class="mielina-score-label">${escapeHtml(t.approved)}</span>
                </div>
                <p class="mielina-score-sub">${escapeHtml(t.approvedSub)}</p>
              </div>
            </header>
            ${renderMatrixInner(q, entry, lang)}
          </div>`;
}

function renderMatrixInner(q, entry, lang) {
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
  const trapHeadline = trap
    ? `<span class="mono" style="color:var(--signal);text-transform:none;letter-spacing:0">⚠️ ${
        lang === 'pt'
          ? `Alternativa ${trap} concentra ${Math.round((counts[trap] / total) * 100)}% das dúvidas`
          : `Option ${trap} accounts for ${Math.round((counts[trap] / total) * 100)}% of traps`
      }</span>`
    : `<span class="mono" style="text-transform:none;letter-spacing:0">${escapeHtml(t.matrixHint)}</span>`;

  const cell = (opt, idx) => {
    const pct = total > 0 ? Math.round((counts[opt] / total) * 100) : opt === answer ? 100 : 0;
    const cls = ['distractor-cell'];
    if (opt === answer) cls.push('is-answer');
    if (opt === trap) cls.push('is-trap');
    const optPreview = shortWords(q.record.snapshot.options[idx] ?? '', 26);
    const rightLabel =
      opt === answer
        ? `${escapeHtml(t.answer)} ✓`
        : opt === trap
          ? `${pct}% · ${escapeHtml(t.trap)}`
          : total > 0
            ? `${pct}%`
            : escapeHtml(t.dissect);
    const barWidth = total > 0 ? pct : opt === answer ? 100 : 12;
    return `<button type="button" class="${cls.join(' ')}" data-filter-opt="${opt}" aria-pressed="false">
              <div class="distractor-top">
                <span class="distractor-letter">ALT ${opt}${opt === answer ? ' ✓' : opt === trap ? ' ⚠️' : ''}</span>
                <span class="distractor-pct">${rightLabel}</span>
              </div>
              <span class="distractor-bar"><i style="width:${barWidth}%"></i></span>
              <span class="distractor-tag">${escapeHtml(optPreview)}</span>
            </button>`;
  };
  return `<div class="mielina-matrix-wrap" aria-labelledby="mielina-matrix-title">
            <div class="mielina-matrix-head">
              <span id="mielina-matrix-title" class="mielina-kicker" style="margin:0">${escapeHtml(t.matrix)}</span>
              ${trapHeadline}
            </div>
            <div class="distractor-grid" role="group" aria-label="${escapeHtml(t.matrix)}">
              ${['A', 'B', 'C', 'D'].map((opt, idx) => cell(opt, idx)).join('\n              ')}
            </div>
          </div>`;
}

function renderMatrix() {
  return '';
}

function renderSynthesis(q, entry, lang) {
  const t = mielinaT(lang);
  const syn = entry?.synthesis;
  const refUrl = String(q.record.snapshot.reference ?? '').trim();
  const refTitle = String(q.record.snapshot.referenceTitle ?? refUrl).trim();
  const answerLetter = optionLetter(q.answerIndex ?? 0);
  const refLink = isSafeUrl(refUrl)
    ? `<a class="mielina-source" href="${escapeHtml(refUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(refTitle || refUrl)}</a>`
    : `<span style="color:var(--fg)">${escapeHtml(refTitle || refUrl || '—')}</span>`;
  const corners = `<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>`;

  if (!syn || typeof syn !== 'object') {
    const baselineText =
      lang === 'pt'
        ? `Gabarito Oficial (${answerLetter}): ${q.answerText}`
        : `Official Answer (${answerLetter}): ${q.answerText}`;
    return `<section class="mielina-box pinned" id="sintese-wiki" aria-labelledby="sintese-title">
            ${corners}
            <div class="mielina-wiki-top">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span id="sintese-title" class="badge-passed">${escapeHtml(t.synthesis)}</span>
                <span class="mono" style="text-transform:none;letter-spacing:0">rev. #1 (baseline) · CC BY-SA 4.0</span>
              </div>
              <a class="mielina-chip" href="#composer">${escapeHtml(t.synthesisCta)} →</a>
            </div>
            <p class="mielina-empty">${escapeHtml(t.synthesisEmpty)}</p>
            <p class="mielina-summary"><strong>${escapeHtml(baselineText)}</strong></p>
            <div class="mielina-official-anchor">
              <div>
                <span class="mono" style="color:var(--accent)">${escapeHtml(t.official)}</span>
                <span style="margin-left:6px">${refLink}</span>
              </div>
              <span class="mono" style="text-transform:none;letter-spacing:0">${escapeHtml(q.ns.app)} · ${escapeHtml(q.record.exam)}</span>
            </div>
          </section>`;
  }

  const summary = String(syn.summary ?? '').trim();
  const source = isSafeUrl(syn.sourceUrl) ? syn.sourceUrl : refUrl;
  const sourceLabel = String(syn.sourceTitle ?? refTitle ?? source).trim();
  const authors = Array.isArray(syn.authors) ? syn.authors.filter(Boolean).map(String) : [];
  const ver = Math.max(1, Number(syn.version) || 1);
  return `<section class="mielina-box pinned" id="sintese-wiki" aria-labelledby="sintese-title">
            ${corners}
            <div class="mielina-wiki-top">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span id="sintese-title" class="badge-passed">${escapeHtml(t.synthesis)}</span>
                <span class="mono" style="text-transform:none;letter-spacing:0">rev. #${escapeHtml(String(ver))} · CC BY-SA 4.0</span>
              </div>
              <button class="mielina-chip" type="button" data-wiki-history aria-pressed="false">↺ v${escapeHtml(String(ver))} · ${escapeHtml(t.revision)}</button>
            </div>
            <div data-wiki-read>
              <p class="mielina-summary">${escapeHtml(summary)}</p>
              <div class="mielina-official-anchor">
                <div>
                  <span class="mono" style="color:var(--accent)">${escapeHtml(t.official)}</span>
                  <span style="margin-left:6px">${
                    isSafeUrl(source)
                      ? `<a class="mielina-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a>`
                      : `<span>${escapeHtml(sourceLabel)}</span>`
                  }</span>
                </div>
                <span class="mono" style="text-transform:none;letter-spacing:0">${escapeHtml(t.coauthors)}: ${authors.map(escapeHtml).join(', ') || '—'}</span>
              </div>
            </div>
            <div class="mielina-wiki-diff" data-wiki-diff hidden>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
                <span style="color:var(--fg)">${lang === 'pt' ? `COMPARANDO REVISÃO #${Math.max(1, ver - 1)} → #${ver} (ATUAL)` : `COMPARING REVISION #${Math.max(1, ver - 1)} → #${ver} (CURRENT)`}</span>
                <span style="color:var(--accent)">${lang === 'pt' ? 'Gate Nível 03 (25+ acelerações)' : 'Tier 03 Gate (25+ accelerations)'}</span>
              </div>
              <p class="diff-del">- ${escapeHtml(lang === 'pt' ? `Revisão anterior (#${Math.max(1, ver - 1)}): explicação resumida apenas ao texto do gabarito (${answerLetter}).` : `Previous revision (#${Math.max(1, ver - 1)}): summary limited to the official answer (${answerLetter}).`)}</p>
              <p class="diff-add">+ ${escapeHtml(summary)}</p>
            </div>
          </section>`;
}

function renderRitual(lang) {
  const t = mielinaT(lang);
  return `<aside class="mielina-ritual" id="ritual-passei" data-ritual hidden aria-label="${escapeHtml(t.ritualTitle)}">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span class="badge-passed" style="padding:4px 9px;font-weight:600;margin-top:2px">✦ ${escapeHtml(t.ritualTitle)}</span>
              <div>
                <p class="mielina-ritual-quote">${escapeHtml(t.ritualQuote)}</p>
                <p class="mielina-ritual-sub">${escapeHtml(t.ritualBody)}</p>
              </div>
            </div>
            <button type="button" class="mielina-chip" data-ritual-dismiss>${escapeHtml(t.ritualDismiss)} ×</button>
          </aside>`;
}

function renderFilters(entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const passedCount = comments.filter((c) => c && c.passed === true).length;
  const chips = [
    { key: 'all', label: `${t.all} (${comments.length})`, pressed: true },
    { key: 'passed', label: `✦ ${t.passed} (${passedCount})`, pressed: false },
    { key: 'source', label: t.sources, pressed: false },
  ];
  return `<div class="mielina-filters-bar">
            <div class="mielina-filters" role="group" aria-label="${escapeHtml(t.filters)}">
              ${chips
                .map(
                  (c) =>
                    `<button type="button" class="mielina-chip" data-filter="${c.key}" aria-pressed="${c.pressed}">${escapeHtml(c.label)}</button>`,
                )
                .join('\n              ')}
            </div>
            <button type="button" class="mielina-chip" data-tiers-toggle style="border-color:transparent;color:var(--accent);text-decoration:underline">
              <span>${escapeHtml(t.howHug)}</span>
            </button>
          </div>`;
}

function renderThread(q, entry, lang) {
  const t = mielinaT(lang);
  const comments = Array.isArray(entry?.comments) ? entry.comments.filter((c) => c && typeof c === 'object') : [];
  const head = `<h3 class="mielina-kicker" id="mielina-thread-title" style="margin:0">${escapeHtml(t.threadTitle)}</h3>`;
  if (comments.length === 0) {
    return `<section class="mielina-thread" data-thread-list aria-labelledby="mielina-thread-title">
            ${head}
            <div class="mielina-box" data-empty-thread>
              <p class="mielina-empty" style="margin:0">${escapeHtml(t.threadEmpty)}</p>
            </div>
          </section>`;
  }
  const cards = comments
    .slice()
    .sort((a, b) => (b.accepted === true) - (a.accepted === true) || (Number(b.accelerations) || 0) - (Number(a.accelerations) || 0))
    .map((c, idx) => {
      const tier = Math.min(4, Math.max(1, Number(c.tier) || 1));
      const handle = String(c.handle ?? '@anon').trim();
      const body = String(c.body ?? '').trim();
      const opt = String(c.option ?? '').toUpperCase();
      const source = isSafeUrl(c.sourceUrl) ? c.sourceUrl : null;
      const accel = Number(c.accelerations) || 0;
      const approved = c.passed === true;
      const roleIcon = tier === 4 ? '🛡️ ' : tier === 3 ? '⚡ ' : '';
      const badges = [
        approved ? `<span class="badge-passed">✦ ${escapeHtml(lang === 'pt' ? `Passei na prova · ${q.record.exam}` : `Passed · ${q.record.exam}`)}</span>` : '',
        `<span class="badge-role">${roleIcon}${escapeHtml(tierNames[lang][tier] ?? '')}</span>`,
        c.accepted === true ? `<span class="badge-role">✓ ${escapeHtml(t.accepted)}</span>` : '',
        opt ? `<span class="badge-trap">${escapeHtml(lang === 'pt' ? 'Alternativa' : 'Option')} ${escapeHtml(opt)}</span>` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const metaSub =
        tier === 4
          ? lang === 'pt'
            ? `${accel} ${t.accelerations} · Abraçado pela Esfera Noos`
            : `${accel} ${t.accelerations} · Embraced by the Noos Sphere`
          : `${accel} ${t.accelerations} · ${escapeHtml(q.ns.app)}`;
      return `<article class="mielina-card${tier === 4 ? ' is-tier-4' : ''}" data-opt="${escapeHtml(opt)}" data-passed="${approved ? '1' : '0'}" data-source="${source ? '1' : '0'}">
              <header class="mielina-card-head">
                <div class="mielina-card-author">
                  <button type="button" class="mielina-avatar-btn" data-tiers-toggle title="${escapeHtml(tierNames[lang][tier] ?? '')}">
                    ${renderNoosAvatarSvg(handle, tier)}
                  </button>
                  <div class="mielina-card-id">
                    <div class="mielina-handle-row">
                      <span class="mielina-handle">${escapeHtml(handle)}</span>
                      ${badges}
                    </div>
                    <div class="mielina-author-meta">${escapeHtml(metaSub)}</div>
                  </div>
                </div>
              </header>
              <p class="mielina-card-body">${escapeHtml(body)}</p>
              <footer class="mielina-card-foot">
                <span>${
                  source
                    ? `${escapeHtml(t.source)} <a class="mielina-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source)}</a>`
                    : escapeHtml(lang === 'pt' ? 'Contribuição verificada sob CC BY-SA 4.0' : 'Verified contribution under CC BY-SA 4.0')
                }</span>
                <button type="button" class="mielina-upvote-btn" data-upvote="${escapeHtml(q.record.id)}-${idx}">
                  <span>▲</span>
                  <span data-vote-num>${accel}</span>
                  <span>· ${escapeHtml(t.accelerateBtn)}</span>
                </button>
              </footer>
            </article>`;
    });
  return `<section class="mielina-thread" data-thread-list aria-labelledby="mielina-thread-title">
            ${head}
            ${cards.join('\n            ')}
          </section>`;
}

function renderComposer(q, lang) {
  const t = mielinaT(lang);
  const id = escapeHtml(q.record.id);
  const d = registry.discussions ?? {};
  const repo = escapeHtml(String(d.repo ?? ''));
  const cat = escapeHtml(String(d.categorySlug ?? 'q-a'));
  const answerIdx = q.answerIndex ?? 0;
  const answerLetter = optionLetter(answerIdx);
  const optItems = ['A', 'B', 'C', 'D'].map((letter, idx) => {
    const preview = shortWords(q.record.snapshot.options[idx] ?? '', 34);
    const prefix =
      letter === answerLetter
        ? lang === 'pt'
          ? `Gabarito ${letter}`
          : `Answer ${letter}`
        : lang === 'pt'
          ? `Pegadinha na Alternativa ${letter}`
          : `Trap in Option ${letter}`;
    return `<option value="${letter}">${escapeHtml(`${prefix} (${preview})`)}</option>`;
  });
  optItems.push(
    `<option value="Geral">${escapeHtml(lang === 'pt' ? 'Dúvida geral sobre o enunciado' : 'General question about the stem')}</option>`,
  );

  return `<section class="mielina-box mielina-composer" id="composer" aria-labelledby="composer-title"
            data-repo="${repo}" data-category="${cat}" data-term="${id}"
            data-msg-missing="${escapeHtml(t.composerMissing)}"
            data-msg-badurl="${escapeHtml(t.composerBadUrl)}"
            data-msg-ready="${escapeHtml(t.composerReady)}">
            <div class="mielina-composer-head">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <h3 id="composer-title" class="mielina-kicker" style="margin:0;color:var(--fg);font-weight:600">${escapeHtml(t.composerTitle)}</h3>
                <span class="badge-passed" data-composer-ritual-tag hidden>✦ ${escapeHtml(t.ritualTitle)}</span>
              </div>
              <span class="mono" style="text-transform:none;letter-spacing:0">${escapeHtml(t.composerSub)}</span>
            </div>
            <div class="mielina-composer-grid">
              <label class="mielina-field">
                <span>${escapeHtml(t.composerOpt)}</span>
                <select data-composer-opt>${optItems.join('')}</select>
              </label>
              <label class="mielina-field">
                <span>${escapeHtml(t.composerFlair)}</span>
                <select data-composer-flair>
                  <option value="passed">${escapeHtml(t.composerFlairPassed)}</option>
                  <option value="studying">${escapeHtml(t.composerFlairStudy)}</option>
                </select>
              </label>
            </div>
            <label class="mielina-field">
              <span>${escapeHtml(t.composerBody)}</span>
              <textarea data-composer-body rows="2" maxlength="1200" placeholder="${escapeHtml(t.composerBodyPlaceholder)}" required></textarea>
            </label>
            <div class="mielina-composer-foot">
              <input class="mielina-source-input" data-composer-source type="url" inputmode="url" placeholder="${escapeHtml(t.composerSourcePlaceholder)}" />
              <button type="button" class="btn primary" data-composer-publish>
                <span>${escapeHtml(t.composerPublish)}</span>
                <span class="arrow">→</span>
              </button>
            </div>
            <span class="mielina-composer-status" data-composer-status role="status" aria-live="polite"></span>
          </section>`;
}

function renderInteractiveOptions(q, entry, lang) {
  const comments = Array.isArray(entry?.comments) ? entry.comments : [];
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const c of comments) {
    const opt = String(c?.option ?? '').toUpperCase();
    if (counts[opt] !== undefined) counts[opt] += 1;
  }
  const answerIdx = q.answerIndex ?? 0;
  const answerLetter = optionLetter(answerIdx);
  let trapLetter = null;
  for (const opt of ['A', 'B', 'C', 'D']) {
    if (opt === answerLetter) continue;
    if (counts[opt] > 0 && (!trapLetter || counts[opt] > counts[trapLetter])) trapLetter = opt;
  }

  return q.record.snapshot.options
    .map((o, idx) => {
      const letter = optionLetter(idx);
      const isAns = letter === answerLetter;
      const isTrap = letter === trapLetter;
      const count = counts[letter] || 0;
      const letterCls = ['q-opt-letter'];
      const btnCls = ['q-opt-anchor'];
      if (isAns) {
        letterCls.push('is-answer');
        btnCls.push('is-answer');
      } else if (isTrap) {
        letterCls.push('is-trap');
        btnCls.push('is-trap');
      }
      const icon = isAns ? '✓' : isTrap ? '⚠️' : '💬';
      const label = count > 0 ? `${icon} ${count}` : `${icon} ${letter}`;
      const title =
        lang === 'pt'
          ? `Filtrar discussão da Alternativa ${letter}`
          : `Filter discussion for Option ${letter}`;
      return `<li class="q-opt-item" data-opt-box="${letter}">
                <span class="${letterCls.join(' ')}">${letter}.</span>
                <span class="q-opt-text">${escapeHtml(o)}</span>
                <button type="button" class="${btnCls.join(' ')}" data-filter-opt="${letter}" aria-pressed="false" title="${escapeHtml(title)}">${label}</button>
              </li>`;
    })
    .join('\n              ');
}

function renderGravityBlock(q, lang) {
  const t = mielinaT(lang);
  const siblings = accepted.filter((other) => other.prefix !== q.prefix && !isRetired(other.record));
  const pool = siblings.length > 0 ? siblings : accepted.filter((other) => other.record.id !== q.record.id);
  if (pool.length === 0) return '';
  const target = pool[(q.lineNumber || 0) % pool.length];
  const targetUrl = `/${lang}/q/${target.record.id}/`;
  const targetPreview = shortWords(target.record.snapshot.statement, 58);
  const desc =
    lang === 'pt'
      ? `Quem estuda ${q.record.exam} no ${q.ns.app} também explora raciocínio analítico correlato no ${target.ns.app}:`
      : `Those studying ${q.record.exam} on ${q.ns.app} also explore related analytical reasoning on ${target.ns.app}:`;
  return `<aside class="q-gravity" aria-label="${escapeHtml(t.gravityLabel)}">
            <span class="mono">${escapeHtml(t.gravityLabel)}</span>
            <p class="q-gravity-desc">${escapeHtml(desc)}</p>
            <a class="q-gravity-link" href="${escapeHtml(targetUrl)}">
              <span style="display:inline-flex;align-items:center;gap:8px;min-width:0">
                <i class="q-gravity-dot" style="--c:${escapeHtml(target.ns.color ?? 'var(--accent)')}"></i>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(target.record.id)} · ${escapeHtml(targetPreview)}</span>
              </span>
              <span style="color:var(--accent);white-space:nowrap">${escapeHtml(t.gravityCta)}</span>
            </a>
          </aside>`;
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
    OPTIONS: renderInteractiveOptions(q, entry, lang),
    GRAVITY_BLOCK: renderGravityBlock(q, lang),
    TIERS_DRAWER: renderTiersDrawer(lang),
    DISCUSSION_HEAD: renderDiscussionHead(q, entry, lang),
    DISCUSSION_MATRIX: renderMatrix(q, entry, lang),
    DISCUSSION_SYNTHESIS: renderSynthesis(q, entry, lang),
    RITUAL_BANNER: renderRitual(lang),
    DISCUSSION_FILTERS: renderFilters(entry, lang),
    DISCUSSION_THREAD: renderThread(q, entry, lang),
    DISCUSSION_COMPOSER: renderComposer(q, lang),
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
    expect(!ptHtml.includes('giscus.app/client.js'), 'opção A: zero iframe do giscus na página (100% Camada de Mielina nativa)');
    expect(ptHtml.includes(`data-term="${accepted[0].record.id}"`), 'compositor usa term = ID público (uma conversa por questão)');
    expect(!existsSync(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html')) || !(await readFile(path.join(OUT_DIR, 'pt', 'q', 'GLI-AZ900-00012', 'index.html'), 'utf8')).includes('data-term='), 'alias/redirect não recebem bloco de discussão');
  } else {
    expect(!ptHtml.includes('giscus.app'), 'discussões desligadas por padrão');
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
  expect(ptHtml.includes('noos-identicon tier-4'), 'avatar identicon Nível 4 (Abraço da Esfera) presente');
  expect(ptHtml.includes('id="tiers-showcase"'), 'painel expansível dos 4 níveis do Abraço da Esfera presente');
  expect(ptHtml.includes('class="q-problem-card corner-box"'), 'coluna esquerda com card emoldurado e cantoneiras ópticas');
  expect(ptHtml.includes('class="q-opt-item"'), 'alternativas renderizadas como cartões de leitura com âncora');
  expect(ptHtml.includes('data-copy-id='), 'botão Citar ID presente no cabeçalho da questão');
  expect(ptHtml.includes('class="q-gravity"'), 'barra de gravidade cross-app presente');
  expect(ptHtml.includes('data-wiki-diff'), 'bloco de diff inline da síntese wiki presente');
  expect(ptHtml.includes('data-upvote='), 'botão interativo de aceleração presente');
  expect(ptHtml.includes('Passei na prova'), 'flair de aprovado presente');
  expect(ptHtml.includes('data-filter-opt="B"'), 'âncora de discussão por alternativa');
  expect(ptHtml.includes('data-composer-publish'), 'compositor guiado presente');
  expect(ptHtml.includes('/js/mielina.js'), 'hidratação progressiva carregada');
  expect(!ptHtml.includes('by Noos'), 'zero "by Noos" na discussão');
  const { parseStructured } = await import('../scripts/sync-discussao.mjs');
  const sampleParsed = parseStructured(
    '**Alternativa que confundiu:** B\n**Status:** ✦ Passei na prova!\n\n**O que a documentação oficial não conta de primeira:**\nConfundi o SLA composto.\n\n**Fonte oficial:** https://learn.microsoft.com/azure/sla',
  );
  expect(
    sampleParsed.option === 'B' &&
      sampleParsed.passed === true &&
      sampleParsed.explanation === 'Confundi o SLA composto.' &&
      sampleParsed.sourceUrl === 'https://learn.microsoft.com/azure/sla',
    'sync-discussao: parser extrai alternativa, status aprovado, explicação e fonte do Compositor Guiado',
  );
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
        const at = html.indexOf(`<span class="q-opt-text">${escapeHtml(option)}</span>`);
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
