/**
 * Dependências injetáveis das Functions da Mielina.
 *
 * Em produção usa `process.env` e o `fetch` global do Node 20. Em teste, basta
 * passar um objeto com `env`, `fetch` e `now` determinísticos para exercitar
 * os handlers sem rede.
 */

import { resetDataCache } from "./data.js";
import { resetRateLimits } from "./rate-limit.js";

export function createDeps(overrides = {}) {
  const env = overrides.env || process.env;
  return {
    env,
    fetch: overrides.fetch || ((...args) => globalThis.fetch(...args)),
    now: overrides.now || (() => new Date()),
    rawBase: overrides.rawBase || env.MIELINA_RAW_BASE || "https://raw.githubusercontent.com",
    logger: overrides.logger || console,
  };
}

export function defaultDeps() {
  return createDeps();
}

/** Limpa caches/rate limits em memória (apenas testes). */
export function resetRuntimeCaches() {
  resetDataCache();
  resetRateLimits();
}
