#!/usr/bin/env node
// build/gera-questoes.mjs — gerador das páginas /q/{ID} do hub Noos.
// spec-pagina-de-questao.md (proposta v1, implementada na v10).
//
// Lê `noos.registry.json` + `manifestos/*.jsonl`, valida com o parser do
// pacote `@ironidesflj/axon` (devDependency de build, pin exato — ZERO Axon
// no output servido) e emite:
//
//   pt/q/{ID}/index.html + en/q/{ID}/index.html   páginas da questão (pares)
//   api/q-data.mjs                                 mapa de aliases + corpo do 404
//   sitemap.xml                                    base + uma entrada por questão
//
// Regras da constitution embutidas: linha inválida é rejeitada com log e o
// build segue (§ sempre 2); checksum divergente rejeita a linha; alias
// duplicada rejeita o record; ID duplicada entre arquivos é rejeitada.
// Zero manifestos = zero páginas, mapa vazio, sitemap igual à base — o site
// fica byte a byte igual (a mãe funciona com zero apps no ar, § nunca 5).
//
// Modo `--qa`: lê `build/fixtures/` em vez de `manifestos/`, escreve em
// `.qa-dist/` e roda as asserções de aceitação da spec. Sai com 0 (PASS)
// ou 1 (FAIL). O fixture NÃO é dado real — nunca acende páginas no ar.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, verifyChecksum, validateId } from '@ironidesflj/axon';

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
const aliasMap = {}; // alias -> canônica
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

// ---------- páginas

const tplPt = await readFile(path.join(ROOT, 'build', 'templates', 'questao-pt.html'), 'utf8');
const tplEn = await readFile(path.join(ROOT, 'build', 'templates', 'questao-en.html'), 'utf8');

const ogDescription = (statement) =>
  escapeHtml(`${statement.replace(/\s+/g, ' ').trim().slice(0, 197)}…`);

const refBlock = (reference, lang) =>
  reference
    ? `<p class="q-ref"><strong>${lang === 'pt' ? 'Referência' : 'Reference'}:</strong> ${escapeHtml(reference)}</p>`
    : '';

const ctaBlock = (ns, lang) =>
  ns.url
    ? `<div class="q-cta"><a class="btn primary" href="${escapeHtml(ns.url)}" target="_blank" rel="noopener">${lang === 'pt' ? `Treinar esta prova no ${escapeHtml(ns.app)}` : `Train this exam on ${escapeHtml(ns.app)}`} <span class="arrow">→</span></a></div>`
    : '';

const langNote = (recordLang, pageLang) => {
  if (pageLang === 'pt' && !/^pt\b/i.test(recordLang))
    return `<span class="q-lang-note">A questão está em ${escapeHtml(recordLang)}.</span>`;
  if (pageLang === 'en' && !/^en\b/i.test(recordLang))
    return `<span class="q-lang-note">This question is in ${escapeHtml(recordLang)}.</span>`;
  return '';
};

const commonMap = (q, lang) => {
  const r = q.record;
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
    ANSWER: escapeHtml(r.snapshot.answer),
    REFERENCE_BLOCK: refBlock(r.snapshot.reference, lang),
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

// ---------- api/q-data.mjs (mapa de aliases + corpo do 404)

const notFoundHtml = await readFile(path.join(ROOT, '404.html'), 'utf8');
const qDataPath = path.join(OUT_DIR, 'api', 'q-data.mjs');
await mkdir(path.dirname(qDataPath), { recursive: true });
await writeFile(
  qDataPath,
  `// GERADO PELO BUILD (\`node build/gera-questoes.mjs\`) — NÃO EDITAR NEM COMMITAR.
// spec-pagina-de-questao.md: a função api/q.js é burra por desenho — forma +
// mapa; zero Axon em runtime (quem valida conteúdo é este build).
export const aliasMap = ${JSON.stringify(aliasMap, null, 2)};
export const canonicalIds = ${JSON.stringify(accepted.map((q) => q.record.id), null, 2)};
export const notFoundBody = ${JSON.stringify(notFoundHtml)};
`,
);

// ---------- sitemap.xml (base + uma entrada por questão)

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
  `saídas: ${pagesWritten} página(s) de questão, api/q-data.mjs (${Object.keys(aliasMap).length} alias, ${accepted.length} canônica(s)), sitemap.xml (${entries ? 'base + questões' : 'igual à base'})`,
);

// ---------- modo --qa: asserções da aceitação (spec-pagina-de-questao.md)

if (QA) {
  const failures = [];
  const expect = (cond, label) => {
    console.log(`[qa] ${cond ? 'PASS' : 'FAIL'} — ${label}`);
    if (!cond) failures.push(label);
  };

  // fixture esperado: 1 aceita (RAN-AZ900-00042), 2 rejeitadas (checksum + JSON)
  expect(accepted.length === 1, `1 questão aceita (veio ${accepted.length})`);
  expect(
    rejections.length === 2 && rejections.every((r) => r.file === 'RAN.jsonl'),
    `2 linhas rejeitadas com log (veio ${rejections.length})`,
  );
  expect(
    accepted[0]?.record.id === 'RAN-AZ900-00042',
    'a aceita é a RAN-AZ900-00042 (exemplo trabalhado do guia)',
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
  expect(
    ptHtml.includes('sha256:1ce39bf5fb075637e16d7f9a39ab626228dcb8c49a52478b5cf031113bc65f09'),
    'checksum completo na proveniência',
  );
  expect(ptHtml.includes('manifestos/RAN.jsonl'), 'link para o manifesto na proveniência');
  expect(ptHtml.includes('GLI-AZ900-00012'), 'alias legada listada');
  expect(ptHtml.includes('Treinar esta prova no Ranvier'), 'volta ao app presente (registry com url)');
  expect(ptHtml.includes(`Sistema Noos v${registry.version}`), 'rodapé PT = versão do registry');
  expect(enHtml.includes('Train this exam on Ranvier'), 'volta ao app presente na EN');
  expect(enHtml.includes(`Noos system v${registry.version}`), 'rodapé EN = versão do registry');
  expect(enHtml.includes('This question is in pt-BR.'), 'nota de idioma da questão na página EN');

  // q-data
  expect(aliasMap['GLI-AZ900-00012'] === 'RAN-AZ900-00042', 'mapa de aliases: GLI → RAN');
  expect(
    JSON.stringify(Object.keys(aliasMap)) === JSON.stringify(['GLI-AZ900-00012']),
    'mapa sem alias órfã',
  );

  // sitemap
  const sitemap = await readFile(path.join(OUT_DIR, 'sitemap.xml'), 'utf8');
  expect(sitemap.includes('https://noos.study/pt/q/RAN-AZ900-00042/'), 'sitemap: entrada PT da questão');
  expect(sitemap.includes('https://noos.study/en/q/RAN-AZ900-00042/'), 'sitemap: entrada EN da questão');

  // página da linha rejeitada não existe
  expect(
    !existsSync(path.join(OUT_DIR, 'pt', 'q', 'RAN-AZ900-00043', 'index.html')),
    'linha com checksum divergente NÃO gerou página',
  );

  console.log(`\n[qa] ${failures.length === 0 ? 'PASS — fixture conforme a spec' : `FAIL (${failures.length})`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}
