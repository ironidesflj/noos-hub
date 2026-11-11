/**
 * Sessão e cookies da Camada de Mielina.
 *
 * A sessão (token de usuário da GitHub App, identidade, CSRF e validade) vive
 * cifrada em cookie `HttpOnly; Secure; SameSite=Lax`; nada de token em
 * localStorage. O estado OAuth (state + PKCE + returnTo) usa um cookie
 * temporário separado, com a mesma cifra.
 */

import { randomToken, seal, unseal } from "./crypto.js";

export const SESSION_COOKIE = "mielina_session";
export const OAUTH_COOKIE = "mielina_oauth";
/** Validade do user token da GitHub App (8 horas). */
export const SESSION_TTL_S = 8 * 60 * 60;
/** Janela para concluir o OAuth (10 minutos). */
export const OAUTH_TTL_S = 10 * 60;

const SESSION_VERSION = 1;
const OAUTH_VERSION = 1;

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

/**
 * Monta o header Set-Cookie. `secure` deve ser true em produção; o modo
 * inseguro existe apenas para `vercel dev` em http://localhost.
 */
export function serializeCookie(name, value, options = {}) {
  const {
    maxAge,
    path: cookiePath = "/",
    secure = true,
    httpOnly = true,
    sameSite = "Lax",
  } = options;
  const parts = [`${name}=${encodeURIComponent(String(value ?? ""))}`];
  parts.push(`Path=${cookiePath}`);
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.trunc(maxAge))}`);
  parts.push(`SameSite=${sameSite}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

export function secureCookies(env = {}) {
  return String(env.MIELINA_INSECURE_COOKIES || "") !== "1";
}

function nowSeconds(now) {
  const value = now instanceof Date ? now.getTime() : Number(now || Date.now());
  return Math.floor(value / 1000);
}

/** Cria a sessão cifrada (cookie + payload de auditoria interna). */
export function createSession(input) {
  const {
    secret,
    token,
    authorId,
    handle,
    now = new Date(),
    ttlS = SESSION_TTL_S,
  } = input || {};
  if (!secret) throw new Error("MIELINA_SESSION_SECRET ausente.");
  if (!token) throw new Error("token de usuário ausente.");
  if (!authorId) throw new Error("authorId ausente.");
  const issuedAt = nowSeconds(now);
  const payload = {
    v: SESSION_VERSION,
    authorId: String(authorId),
    handle: String(handle || ""),
    token: String(token),
    csrf: randomToken(24),
    iat: issuedAt,
    exp: issuedAt + Math.trunc(ttlS),
  };
  return { value: seal(secret, payload), payload, csrf: payload.csrf, maxAge: ttlS };
}

/** Lê e valida a sessão do cookie. Nunca lança: retorna motivo. */
export function readSession(input) {
  const { secret, cookies, now = new Date() } = input || {};
  const raw = cookies ? cookies[SESSION_COOKIE] : "";
  if (!raw) return { ok: false, reason: "missing" };
  if (!secret) return { ok: false, reason: "secret_missing" };
  let payload;
  try {
    payload = unseal(secret, raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!payload || payload.v !== SESSION_VERSION || !payload.authorId || !payload.token) {
    return { ok: false, reason: "invalid" };
  }
  if (Number(payload.exp) <= nowSeconds(now)) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

export function sessionSetCookie(value, options = {}) {
  const { secure = true, maxAge = SESSION_TTL_S } = options;
  return serializeCookie(SESSION_COOKIE, value, { secure, httpOnly: true, maxAge });
}

/** Cria o cookie temporário do OAuth (state + PKCE + returnTo). */
export function createOAuthState(input) {
  const {
    secret,
    state,
    verifier,
    returnTo = "/",
    now = new Date(),
    ttlS = OAUTH_TTL_S,
  } = input || {};
  const issuedAt = nowSeconds(now);
  const payload = {
    v: OAUTH_VERSION,
    state: String(state || ""),
    verifier: String(verifier || ""),
    returnTo: String(returnTo || "/"),
    iat: issuedAt,
    exp: issuedAt + Math.trunc(ttlS),
  };
  return { value: seal(secret, payload), payload };
}

export function readOAuthState(input) {
  const { secret, cookies, now = new Date() } = input || {};
  const raw = cookies ? cookies[OAUTH_COOKIE] : "";
  if (!raw) return { ok: false, reason: "missing" };
  let payload;
  try {
    payload = unseal(secret, raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!payload || payload.v !== OAUTH_VERSION || !payload.state || !payload.verifier) {
    return { ok: false, reason: "invalid" };
  }
  if (Number(payload.exp) <= nowSeconds(now)) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

export function oauthSetCookie(value, options = {}) {
  const { secure = true, maxAge = OAUTH_TTL_S } = options;
  return serializeCookie(OAUTH_COOKIE, value, { secure, httpOnly: true, maxAge });
}
