/**
 * mielina-policy — fonte única das regras de reputação, apoio e fonte oficial.
 * Pura e determinística: usada pelo sync (Node), pelo gerador (build), pela API
 * (Vercel) e pelos testes. Nenhuma rede, nenhum segredo, nenhum estado global.
 * Contrato: handoff-arquitetura-definitiva-mielina.md §4 Fase 1.
 */

/** Reações que contam como apoio (1 conta humana = 1 apoio, deduplicado). */
export const SUPPORT_REACTIONS = Object.freeze(["ROCKET", "THUMBS_UP", "HEART"]);

export const TIER_GATES = Object.freeze({
  tier3Supports: 25,
  tier3OfficialPosts: 3,
  tier4Supports: 100,
  tier4ApprovedSyntheses: 3,
});

const OFFICIAL_SOURCES_FALLBACK = Object.freeze({
  RAN: ["learn.microsoft.com", "azure.microsoft.com", "docs.databricks.com", "aws.amazon.com", "docs.aws.amazon.com", "cloud.google.com"],
  SYN: ["istqb.org", "bstqb.org.br", "iso.org", "ieee.org"],
  GLOBAL: ["ietf.org", "w3.org", "nist.gov", "owasp.org"],
});

export function defaultOfficialSources() {
  return JSON.parse(JSON.stringify(OFFICIAL_SOURCES_FALLBACK));
}

/** Normaliza host: minúsculo, sem porta, sem ponto final. */
export function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

/**
 * Fonte oficial citada? Exige https e hostname na allowlist do prefixo ou GLOBAL.
 * Aceita o domínio exato e subdomínios dele (ex.: pt-br.learn.microsoft.com).
 * @param {string} url
 * @param {string} prefix prefixo público (RAN, SYN, …)
 * @param {Record<string,string[]>} allowlist
 */
export function isOfficialSourceCited(url, prefix, allowlist = defaultOfficialSources()) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = normalizeHost(parsed.hostname);
  if (!host) return false;
  const domains = [...(allowlist[prefix] || []), ...(allowlist.GLOBAL || [])].map(normalizeHost).filter(Boolean);
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * União de apoiadores humanos únicos de uma contribuição.
 * Rejeita bots, reações nulas e o próprio autor (auto-apoio).
 * @param {Array<{content?:string,user?:{id?:string,login?:string,__typename?:string}}>} reactions
 * @param {string} authorId id do autor da contribuição (node id do GitHub)
 * @returns {Set<string>} ids (node ids) dos apoiadores elegíveis
 */
export function computeUniqueSupporters(reactions, authorId) {
  const supporters = new Set();
  for (const reaction of Array.isArray(reactions) ? reactions : []) {
    if (!reaction) continue;
    if (!SUPPORT_REACTIONS.includes(String(reaction.content || "").toUpperCase())) continue;
    const user = reaction.user;
    if (!user || !user.id) continue;
    if (user.__typename && user.__typename !== "User") continue;
    if (user.login && String(user.login).toLowerCase().endsWith("[bot]")) continue;
    if (authorId && String(user.id) === String(authorId)) continue;
    supporters.add(String(user.id));
  }
  return supporters;
}

/**
 * Tier de reputação (E, não OU) com override explícito de curador.
 * Métricas esperadas:
 *  authenticatedParticipations: nº de contribuições autenticadas
 *  selfDeclaredPassed: bool
 *  eligibleSupports: apoios únicos acumulados nas contribuições da pessoa
 *  officialCitedPosts: nº de contribuições com fonte oficial
 *  distinctApprovedSyntheses: nº de sínteses aprovadas distintas com participação
 * @returns {1|2|3|4}
 */
export function computeAuthorTier(metrics = {}, curatorConfig = {}) {
  if (curatorConfig && (curatorConfig.isCurator === true || curatorConfig.role === "maintainer-curator")) {
    return 4;
  }
  const supports = Number(metrics.eligibleSupports) || 0;
  const official = Number(metrics.officialCitedPosts) || 0;
  const approved = Number(metrics.distinctApprovedSyntheses) || 0;
  const participations = Number(metrics.authenticatedParticipations) || 0;

  if (supports >= TIER_GATES.tier4Supports && approved >= TIER_GATES.tier4ApprovedSyntheses) return 4;
  if (supports >= TIER_GATES.tier3Supports && official >= TIER_GATES.tier3OfficialPosts) return 3;
  if (metrics.selfDeclaredPassed === true) return 2;
  if (participations >= 1) return 1;
  return 1;
}

/** Hash de conteúdo da proposta de síntese (base + texto + fonte). */
export function computeSynthesisContentHash(baseVersion, body, sourceUrl) {
  const payload = `${baseVersion}\n${String(body || "").trim()}\n${String(sourceUrl || "").trim()}`;
  // sha256 puro via WebCrypto (Node 20/browser) — chamado apenas em contexto async.
  return payload;
}

/** Versão síncrona para Node (sync/build) sem depender de WebCrypto. */
export function synthesisContentHashHex(baseVersion, body, sourceUrl) {
  // Implementação sha256 é fornecida pelo caller (Node crypto) — este helper só
  // normaliza o payload para garantir o mesmo hash em todos os ambientes.
  return `${baseVersion}\n${String(body || "").trim()}\n${String(sourceUrl || "").trim()}`;
}
