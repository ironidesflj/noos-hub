/**
 * HTTP da API da Mielina: respostas sem cache, leitura de JSON, validação de
 * Origin/CSRF, sessão obrigatória, rate limit e erros sem vazar segredos.
 * Compatível com Vercel Functions (Node) e com dublês de teste.
 */

import { safeEqual } from "./crypto.js";
import { rateLimit } from "./rate-limit.js";
import { parseCookies, readSession } from "./session.js";

export class HttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = options.headers || {};
    this.details = Array.isArray(options.details) ? options.details : null;
  }
}

export function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    Vary: "Cookie, Origin",
  };
}

export function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  const headers = {
    ...noStoreHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(payload)),
    ...extraHeaders,
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) res.setHeader(key, value);
  }
  res.statusCode = status;
  res.end(payload);
}

export function redirect(res, location, cookies = [], status = 302) {
  const headers = { ...noStoreHeaders(), Location: location, "Content-Length": "0" };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) res.setHeader(key, value);
  }
  res.statusCode = status;
  res.end();
}

/** Converte qualquer erro em resposta JSON; erro interno não vaza detalhe. */
export function fail(res, error, logger = console) {
  if (res && (res.headersSent || res.writableEnded)) return;
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "INTERNAL";
  const message = known ? error.message : "Erro interno ao processar a requisição.";
  const body = { ok: false, error: code, message };
  if (known && error.details) body.errors = error.details;
  if (!known && logger && typeof logger.error === "function") {
    logger.error("[mielina] erro interno:", error && error.message ? error.message : error);
  }
  json(res, status, body, known ? error.headers : {});
}

export async function readJsonBody(req, options = {}) {
  const limit = options.limit || 64 * 1024;
  const contentType = String(
    (req.headers && (req.headers["content-type"] || req.headers["Content-Type"])) || ""
  ).toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type deve ser application/json.");
  }
  let raw;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) raw = req.body.toString("utf8");
    else if (typeof req.body === "string") raw = req.body;
    else if (typeof req.body === "object") return req.body;
  }
  if (raw === undefined) {
    if (!req || typeof req[Symbol.asyncIterator] !== "function") {
      throw new HttpError(400, "EMPTY_BODY", "Corpo da requisição ausente.");
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Corpo da requisição grande demais.");
      }
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (!String(raw).trim()) {
    throw new HttpError(400, "EMPTY_BODY", "Corpo JSON vazio.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Corpo não é JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "INVALID_JSON", "Corpo JSON deve ser um objeto.");
  }
  return parsed;
}

export function requireMethod(req, allowed) {
  const method = String((req && req.method) || "GET").toUpperCase();
  if (!allowed.includes(method)) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `Método ${method} não permitido; use ${allowed.join(" ou ")}.`, {
      headers: { Allow: allowed.join(", ") },
    });
  }
  return method;
}

export function requireEnv(env, names) {
  const missing = names.filter((name) => !String((env && env[name]) || "").trim());
  if (missing.length) {
    throw new HttpError(
      503,
      "ENV_MISSING",
      `Configuração ausente no servidor: ${missing.join(", ")}.`
    );
  }
}

export function baseUrl(env) {
  requireEnv(env, ["MIELINA_BASE_URL"]);
  let parsed;
  try {
    parsed = new URL(String(env.MIELINA_BASE_URL));
  } catch {
    throw new HttpError(503, "ENV_INVALID", "MIELINA_BASE_URL inválida.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new HttpError(503, "ENV_INVALID", "MIELINA_BASE_URL precisa ser https.");
  }
  return parsed;
}

/** Origens aceitas: MIELINA_BASE_URL + MIELINA_ALLOWED_ORIGINS (CSV). */
export function allowedOrigins(env) {
  const origins = new Set();
  const base = String((env && env.MIELINA_BASE_URL) || "").trim();
  if (base) {
    try {
      origins.add(new URL(base).origin);
    } catch {
      throw new HttpError(503, "ENV_INVALID", "MIELINA_BASE_URL inválida.");
    }
  }
  for (const item of String((env && env.MIELINA_ALLOWED_ORIGINS) || "").split(",")) {
    const value = item.trim();
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      throw new HttpError(503, "ENV_INVALID", "MIELINA_ALLOWED_ORIGINS tem origem inválida.");
    }
  }
  return origins;
}

export function requestHeader(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

/** Exige Origin de mesma origem para requisições mutantes (CSRF de navegador). */
export function assertAllowedOrigin(req, env) {
  const origin = String(requestHeader(req, "origin") || "").trim();
  if (!origin) throw new HttpError(403, "ORIGIN_REQUIRED", "Header Origin obrigatório.");
  if (!allowedOrigins(env).has(origin)) {
    throw new HttpError(403, "ORIGIN_FORBIDDEN", "Origem não autorizada.");
  }
}

/** Double-submit: header X-Mielina-CSRF igual ao token cifrado na sessão. */
export function assertCsrf(req, sessionPayload) {
  const provided = String(requestHeader(req, "x-mielina-csrf") || "").trim();
  if (!provided || !safeEqual(provided, sessionPayload && sessionPayload.csrf)) {
    throw new HttpError(403, "CSRF_INVALID", "Token CSRF ausente ou inválido.");
  }
}

export function readSessionPayload(req, deps) {
  const env = (deps && deps.env) || {};
  if (!env.MIELINA_SESSION_SECRET) return null;
  const cookies = parseCookies(requestHeader(req, "cookie"));
  const session = readSession({
    secret: env.MIELINA_SESSION_SECRET,
    cookies,
    now: deps.now ? deps.now() : new Date(),
  });
  return session.ok ? session.payload : null;
}

/**
 * Sessão obrigatória. Em mutações, valida Origin e depois o token CSRF.
 * `csrf: true` já implica validação de Origin.
 */
export function requireSession(req, deps, options = {}) {
  const env = (deps && deps.env) || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  if (options.csrf) assertAllowedOrigin(req, env);
  const session = readSessionPayload(req, deps);
  if (!session) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sessão ausente ou expirada. Entre com o GitHub.");
  }
  if (options.csrf) assertCsrf(req, session);
  return session;
}

export function clientIp(req) {
  const forwarded = String(requestHeader(req, "x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || String(requestHeader(req, "x-real-ip") || "").trim() || "unknown";
}

export function guardRateLimit(deps, key, options = {}) {
  const nowValue = deps && deps.now ? deps.now() : new Date();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const outcome = rateLimit(key, { ...options, now: nowMs });
  if (!outcome.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.", {
      headers: { "Retry-After": String(outcome.retryAfterS) },
    });
  }
}
