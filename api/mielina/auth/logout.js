/**
 * POST /api/mielina/auth/logout
 *
 * Encerra a sessão limpando os cookies cifrados. Exige Origin + CSRF, para que
 * um site terceiro não consiga deslogar o visitante.
 */

import { defaultDeps } from "../../../lib/mielina/deps.js";
import { route } from "../../../lib/mielina/handler.js";
import { json, requireEnv, requireMethod } from "../../../lib/mielina/http.js";
import { requireSession } from "../../../lib/mielina/http.js";
import {
  clearCookie,
  OAUTH_COOKIE,
  secureCookies,
  SESSION_COOKIE,
} from "../../../lib/mielina/session.js";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["POST"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  requireSession(req, deps, { csrf: true });
  const secure = secureCookies(env);
  json(res, 200, { ok: true }, {
    "Set-Cookie": [
      clearCookie(SESSION_COOKIE, { secure }),
      clearCookie(OAUTH_COOKIE, { secure }),
    ],
  });
}

export default route(handle);
