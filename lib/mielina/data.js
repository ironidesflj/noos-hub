/**
 * Leitura fail-safe dos dados publicados em `main` para a API da Mielina.
 *
 * A API não escreve nos dumps: ela lê `discussao/reputation.json`,
 * `discussao/{PREFIX}.json` e `manifestos/{PREFIX}.jsonl` do raw do GitHub, com
 * cache curto por instância. Dados ausentes/indisponíveis nunca concedem
 * privilégio: reputação vazia ⇒ tier 1; rede fora ⇒ erro tratado pelo handler
 * (fail-closed nas rotas de curadoria).
 */

import {
  getAuthorTier,
  isValidQuestionId,
  normalizeReputation,
  parseQuestionPrefix,
} from "../../scripts/curadoria-sintese.mjs";

const CACHE_TTL_MS = Object.freeze({
  reputation: 60_000,
  snapshot: 30_000,
  manifest: 300_000,
});

const cache = new Map();

/** Apenas para testes/instâncias. */
export function resetDataCache() {
  cache.clear();
}

export function repoFromEnv(deps) {
  const value = String((deps && deps.env && deps.env.MIELINA_REPO) || "ironidesflj/noos-hub").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ? value : "ironidesflj/noos-hub";
}

function nowMs(deps) {
  const value = deps && deps.now ? deps.now() : new Date();
  return value instanceof Date ? value.getTime() : Number(value);
}

function rawBase(deps) {
  return String((deps && deps.rawBase) || "https://raw.githubusercontent.com").replace(/\/+$/, "");
}

async function fetchText(deps, repo, filePath) {
  const url = `${rawBase(deps)}/${repo}/main/${filePath}`;
  let response;
  try {
    response = await deps.fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "noos-mielina-api" },
    });
  } catch (error) {
    return { ok: false, error: `falha de rede ao ler ${filePath}: ${error && error.message}` };
  }
  if (response.status === 404) return { ok: true, notFound: true, text: "" };
  if (!response.ok) return { ok: false, error: `HTTP ${response.status} ao ler ${filePath}` };
  try {
    return { ok: true, notFound: false, text: await response.text() };
  } catch (error) {
    return { ok: false, error: `falha ao ler ${filePath}: ${error && error.message}` };
  }
}

async function cached(deps, key, ttlMs, loader) {
  const current = nowMs(deps);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > current) return hit.value;
  const value = await loader();
  cache.set(key, { expiresAt: current + ttlMs, value });
  return value;
}

/**
 * `discussao/reputation.json` normalizado. 404 ⇒ estado vazio (fail-safe);
 * erro de rede/parse ⇒ `{ok:false}` para o handler decidir (fail-closed).
 */
export async function loadReputation(deps) {
  const repo = repoFromEnv(deps);
  return cached(deps, `reputation:${repo}`, CACHE_TTL_MS.reputation, async () => {
    const raw = await fetchText(deps, repo, "discussao/reputation.json");
    if (!raw.ok) return { ok: false, error: raw.error };
    if (raw.notFound) {
      return { ok: true, missing: true, reputation: normalizeReputation({}) };
    }
    try {
      return { ok: true, missing: false, reputation: normalizeReputation(JSON.parse(raw.text)) };
    } catch (error) {
      return { ok: false, error: `JSON inválido em discussao/reputation.json: ${error.message}` };
    }
  });
}

/** Snapshot de uma questão em `discussao/{PREFIX}.json`. */
export async function loadSnapshot(deps, questionId) {
  if (!isValidQuestionId(questionId)) {
    return { ok: true, snapshot: null, missing: true };
  }
  const prefix = parseQuestionPrefix(questionId);
  const repo = repoFromEnv(deps);
  // O cache é do DOCUMENTO por prefixo; a questão é extraída por chamada (evita
  // devolver o snapshot de uma questão para outra do mesmo prefixo).
  const loaded = await cached(
    deps,
    `snapshot:${repo}:${prefix}`,
    CACHE_TTL_MS.snapshot,
    async () => {
      const raw = await fetchText(deps, repo, `discussao/${prefix}.json`);
      if (!raw.ok) return { ok: false, error: raw.error };
      if (raw.notFound) return { ok: true, missing: true, document: {} };
      try {
        const document = JSON.parse(raw.text);
        return {
          ok: true,
          missing: false,
          document: document && typeof document === "object" ? document : {},
        };
      } catch (error) {
        return { ok: false, error: `JSON inválido em discussao/${prefix}.json: ${error.message}` };
      }
    }
  );
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const snapshot =
    loaded.document && loaded.document[questionId] ? loaded.document[questionId] : null;
  return { ok: true, missing: !snapshot, snapshot };
}

/** Registro da questão no manifesto público (`manifestos/{PREFIX}.jsonl`). */
export async function loadManifestQuestion(deps, questionId) {
  if (!isValidQuestionId(questionId)) {
    return { ok: true, found: false, missing: true, record: null };
  }
  const prefix = parseQuestionPrefix(questionId);
  const repo = repoFromEnv(deps);
  const loaded = await cached(deps, `manifest:${repo}:${prefix}`, CACHE_TTL_MS.manifest, async () => {
    const raw = await fetchText(deps, repo, `manifestos/${prefix}.jsonl`);
    if (!raw.ok) return { ok: false, error: raw.error };
    if (raw.notFound) return { ok: true, missing: true, records: new Map() };
    const records = new Map();
    for (const line of raw.text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        if (record && record.id) records.set(String(record.id), record);
      } catch {
        /* linha inválida é ignorada: o build já valida o manifesto */
      }
    }
    return { ok: true, missing: false, records };
  });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const record = loaded.records.get(questionId) || null;
  return { ok: true, found: Boolean(record), missing: loaded.missing, record };
}

/** Tier do autor a partir da reputação publicada (policy única). */
export function tierOf(reputation, authorId) {
  return getAuthorTier(reputation, authorId);
}

export { normalizeReputation };
