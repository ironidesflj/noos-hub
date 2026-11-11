/**
 * Rate limit simples em memória (fixed window) por instância de Function.
 *
 * Não é distribuído: protege contra rajadas/abuso trivial dentro de uma
 * instância quente da Vercel. O limite autoritativo de segurança continua
 * sendo o GitHub (token, permissões e revalidação no workflow de curadoria).
 */

const buckets = new Map();

export function rateLimit(key, options = {}) {
  const {
    limit = 30,
    windowMs = 60_000,
    now = Date.now(),
  } = options;
  const id = String(key || "anon");
  const existing = buckets.get(id);
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(id, { count: 1, resetAt });
    maybeCleanup(now);
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterS: 0, resetAt };
  }
  if (existing.count >= limit) {
    const retryAfterS = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, remaining: 0, retryAfterS, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfterS: 0, resetAt: existing.resetAt };
}

function maybeCleanup(now) {
  if (buckets.size < 512) return;
  for (const [key, value] of buckets) {
    if (!value || now >= value.resetAt) buckets.delete(key);
  }
}

/** Apenas para testes. */
export function resetRateLimits() {
  buckets.clear();
}
