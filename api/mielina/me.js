/**
 * GET /api/mielina/me
 *
 * Endpoint leve de identidade para a UI da Fase 5. Lê a sessão do cookie e o
 * estado publicado de reputação em `main`, sem nunca devolver o token.
 *
 * Resposta 200:
 *   { authenticated, authorId?, handle?, tier?, isCurator?, observedAt,
 *     csrfToken? }
 *
 * `csrfToken` é um acréscimo documentado ao contrato mínimo: o cliente da
 * Mielina precisa dele para o double-submit das mutações (o cookie de sessão é
 * HttpOnly). `degraded: true` indica que a reputação não pôde ser lida e o
 * tier devolvido é o mínimo (1) — nunca um privilégio.
 */

import { defaultDeps } from "../../lib/mielina/deps.js";
import { route } from "../../lib/mielina/handler.js";
import {
  json,
  readSessionPayload,
  requireEnv,
  requireMethod,
} from "../../lib/mielina/http.js";
import { loadReputation, tierOf } from "../../lib/mielina/data.js";
import { nowIso } from "../../lib/mielina/routes-common.js";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["GET"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  const observedAt = nowIso(deps);
  const session = readSessionPayload(req, deps);
  if (!session) {
    json(res, 200, { authenticated: false, observedAt });
    return;
  }

  const loaded = await loadReputation(deps);
  if (!loaded.ok || loaded.missing) {
    json(res, 200, {
      authenticated: true,
      authorId: session.authorId,
      handle: session.handle,
      tier: 1,
      isCurator: false,
      csrfToken: session.csrf,
      observedAt,
      degraded: true,
    });
    return;
  }
  const tierInfo = tierOf(loaded.reputation, session.authorId);
  json(res, 200, {
    authenticated: true,
    authorId: session.authorId,
    handle: session.handle,
    tier: tierInfo.tier,
    isCurator: tierInfo.isCurator,
    csrfToken: session.csrf,
    observedAt,
  });
}

export default route(handle);
