/**
 * GET /api/mielina/auth/login
 *
 * Inicia o OAuth da GitHub App com `state` + PKCE (S256) e guarda o retorno
 * pretendido (`returnTo`) num cookie temporário cifrado. Nenhum segredo sai do
 * servidor; o navegador só recebe o cookie HttpOnly e o redirect para GitHub.
 */

import { createOAuthStateValue, createPkcePair } from "../../../lib/mielina/crypto.js";
import { defaultDeps } from "../../../lib/mielina/deps.js";
import { route } from "../../../lib/mielina/handler.js";
import {
  baseUrl,
  redirect,
  requireEnv,
  requireMethod,
} from "../../../lib/mielina/http.js";
import { requestUrl, safeReturnTo } from "../../../lib/mielina/routes-common.js";
import {
  createOAuthState,
  oauthSetCookie,
  OAUTH_TTL_S,
  secureCookies,
} from "../../../lib/mielina/session.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["GET"]);
  const env = deps.env || {};
  requireEnv(env, [
    "MIELINA_GITHUB_CLIENT_ID",
    "MIELINA_SESSION_SECRET",
    "MIELINA_BASE_URL",
  ]);
  const base = baseUrl(env);
  const requestQuery = requestUrl(req, deps);
  const returnTo = safeReturnTo(requestQuery.searchParams.get("returnTo"));

  const state = createOAuthStateValue();
  const { verifier, challenge } = createPkcePair();
  const oauthCookie = createOAuthState({
    secret: env.MIELINA_SESSION_SECRET,
    state,
    verifier,
    returnTo,
    now: deps.now(),
  });

  const authorize = new URL(GITHUB_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", String(env.MIELINA_GITHUB_CLIENT_ID));
  authorize.searchParams.set(
    "redirect_uri",
    `${base.origin}/api/mielina/auth/callback`
  );
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("allow_signup", "false");

  const cookie = oauthSetCookie(oauthCookie.value, {
    secure: secureCookies(env),
    maxAge: OAUTH_TTL_S,
  });
  redirect(res, authorize.toString(), [cookie]);
}

export default route(handle);
