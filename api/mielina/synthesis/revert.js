/**
 * POST /api/mielina/synthesis/revert
 *
 * Nível 4 (ou curador) restaura o texto de uma versão anterior como v(N+1),
 * preservando `synthesis.revisions[]` (append-only). A API apenas valida e
 * dispara o repository_dispatch; o workflow revalida em `main` e commita.
 *
 * Payload: { questionId, baseVersion, targetVersion, reason }
 */

import {
  DISPATCH_EVENT_TYPE,
  parseQuestionPrefix,
  validateCuration,
  validateRevertPayload,
} from "../../../scripts/curadoria-sintese.mjs";
import { repoFromEnv } from "../../../lib/mielina/data.js";
import { defaultDeps } from "../../../lib/mielina/deps.js";
import { route } from "../../../lib/mielina/handler.js";
import {
  HttpError,
  clientIp,
  guardRateLimit,
  json,
  readJsonBody,
  requireEnv,
  requireMethod,
  requireSession,
} from "../../../lib/mielina/http.js";
import {
  dispatchClientFor,
  loadReputationOrThrow,
  loadSnapshotOrThrow,
  newDispatchId,
  nowIso,
} from "../../../lib/mielina/routes-common.js";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["POST"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  const session = requireSession(req, deps, { csrf: true });

  const payload = await readJsonBody(req);
  const validated = validateRevertPayload(payload);
  if (!validated.ok) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Payload de reversão inválido.", {
      details: validated.errors,
    });
  }
  const value = validated.value;
  guardRateLimit(deps, `revert:${session.authorId}:${clientIp(req)}`, {
    limit: 5,
    windowMs: 60_000,
  });

  const reputation = await loadReputationOrThrow(deps);
  const snapshot = await loadSnapshotOrThrow(deps, value.questionId);
  if (!snapshot) {
    throw new HttpError(404, "SNAPSHOT_NOT_FOUND", "Snapshot da questão não encontrado em main.");
  }

  const observedAt = nowIso(deps);
  const dispatchPayload = {
    action: "revert",
    repo: repoFromEnv(deps),
    questionId: value.questionId,
    prefix: parseQuestionPrefix(value.questionId),
    targetVersion: value.targetVersion,
    baseVersion: value.baseVersion,
    reason: value.reason,
    contentHash: "",
    proposalId: "",
    approverId: session.authorId,
    approverHandle: session.handle,
    approverTier: 0,
    dispatchId: newDispatchId(),
    requestedAt: observedAt,
  };

  const outcome = validateCuration({
    payload: dispatchPayload,
    reputation,
    snapshot,
    now: observedAt,
  });
  if (!outcome.ok) {
    throw new HttpError(outcome.status, outcome.code, outcome.message, {
      details: outcome.errors && outcome.errors.length > 1 ? outcome.errors : null,
    });
  }
  if (outcome.noop) {
    json(res, 200, {
      ok: true,
      alreadyApplied: true,
      questionId: value.questionId,
      observedAt,
    });
    return;
  }

  dispatchPayload.approverTier = outcome.revision.approverTier;
  const dispatcher = dispatchClientFor(deps);
  await dispatcher.dispatchEvent(DISPATCH_EVENT_TYPE, dispatchPayload);

  json(res, 202, {
    ok: true,
    dispatched: true,
    questionId: value.questionId,
    baseVersion: value.baseVersion,
    targetVersion: value.targetVersion,
    approverId: session.authorId,
    observedAt,
  });
}

export default route(handle);
