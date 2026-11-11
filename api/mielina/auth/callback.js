/**
 * GET /api/mielina/auth/callback
 *
 * Conclui o OAuth da GitHub App: confere `state`, troca o `code` com o
 * `code_verifier` (PKCE), confirma a identidade (`viewer`) e grava a sessão
 * cifrada em cookie HttpOnly/Secure/SameSite=Lax por, no máximo, 8 horas.
 * Falhas redirecionam com um código curto de motivo — nunca com token.
 */

import { safeEqual } from "../../../lib/mielina/crypto.js";
import { defaultDeps } from "../../../lib/mielina/deps.js";
import { GitHubClient } from "../../../lib/mielina/github.js";
import { route } from "../../../lib/mielina/handler.js";
import {
  baseUrl,
  redirect,
  requireEnv,
  requireMethod,
} from "../../../lib/mielina/http.js";
import { repoFromEnv } from "../../../lib/mielina/data.js";
import { requestUrl, safeReturnTo } from "../../../lib/mielina/routes-common.js";
import {
  createSession,
  clearCookie,
  OAUTH_COOKIE,
  readOAuthState,
  secureCookies,
  SESSION_TTL_S,
  sessionSetCookie,
} from "../../../lib/mielina/session.js";
import { parseCookies } from "../../../lib/mielina/session.js";

const TOKEN_URL = "https://github.com/login/oauth/access_token";
const ERROR_CODES = new Set([
  "access_denied",
  "redirect_uri_mismatch",
  "bad_verification_code",
  "unverified_user_email",
  "incorrect_client_credentials",
  "state",
  "code_missing",
  "rede",
  "viewer",
  "oauth_error",
  "invalid",
  "expired",
  "missing",
]);

function errorRedirect(res, base, secure, reason) {
  const safeReason = ERROR_CODES.has(String(reason)) ? reason : "falha";
  redirect(
    res,
    `${base.origin}/?mielina=erro&motivo=${encodeURIComponent(safeReason)}`,
    [clearCookie(OAUTH_COOKIE, { secure })]
  );
}

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["GET"]);
  const env = deps.env || {};
  requireEnv(env, [
    "MIELINA_GITHUB_CLIENT_ID",
    "MIELINA_GITHUB_CLIENT_SECRET",
    "MIELINA_SESSION_SECRET",
    "MIELINA_BASE_URL",
  ]);
  const base = baseUrl(env);
  const secure = secureCookies(env);
  const requestQuery = requestUrl(req, deps);
  const code = String(requestQuery.searchParams.get("code") || "");
  const state = String(requestQuery.searchParams.get("state") || "");
  const oauthError = String(requestQuery.searchParams.get("error") || "");

  const cookies = parseCookies(
    (req.headers && (req.headers.cookie || req.headers.Cookie)) || ""
  );
  const oauth = readOAuthState({
    secret: env.MIELINA_SESSION_SECRET,
    cookies,
    now: deps.now(),
  });
  if (!oauth.ok) return errorRedirect(res, base, secure, oauth.reason);
  if (oauthError) return errorRedirect(res, base, secure, oauthError);
  if (!code) return errorRedirect(res, base, secure, "code_missing");
  if (!safeEqual(state, oauth.payload.state)) {
    return errorRedirect(res, base, secure, "state");
  }

  const form = new URLSearchParams({
    client_id: String(env.MIELINA_GITHUB_CLIENT_ID),
    client_secret: String(env.MIELINA_GITHUB_CLIENT_SECRET),
    code,
    redirect_uri: `${base.origin}/api/mielina/auth/callback`,
    code_verifier: String(oauth.payload.verifier),
  });
  let tokenResponse;
  try {
    tokenResponse = await deps.fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "noos-mielina-api",
      },
      body: form.toString(),
    });
  } catch {
    return errorRedirect(res, base, secure, "rede");
  }
  let tokenData = null;
  try {
    tokenData = await tokenResponse.json();
  } catch {
    tokenData = null;
  }
  if (!tokenResponse.ok || !tokenData || !tokenData.access_token) {
    return errorRedirect(res, base, secure, "oauth_error");
  }
  const accessToken = String(tokenData.access_token);
  const expiresIn = Number(tokenData.expires_in) || SESSION_TTL_S;
  const ttl = Math.min(Math.max(60, Math.trunc(expiresIn)), SESSION_TTL_S);

  let viewer;
  try {
    const gh = new GitHubClient({
      token: accessToken,
      repo: repoFromEnv(deps),
      fetchImpl: deps.fetch,
    });
    viewer = await gh.getViewer();
  } catch {
    return errorRedirect(res, base, secure, "viewer");
  }

  const session = createSession({
    secret: env.MIELINA_SESSION_SECRET,
    token: accessToken,
    authorId: viewer.authorId,
    handle: viewer.handle,
    now: deps.now(),
    ttlS: ttl,
  });
  const returnTo = safeReturnTo(oauth.payload.returnTo);
  redirect(res, `${base.origin}${returnTo}`, [
    sessionSetCookie(session.value, { secure, maxAge: ttl }),
    clearCookie(OAUTH_COOKIE, { secure }),
  ]);
}

export default route(handle);
