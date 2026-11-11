/**
 * POST /api/mielina/synthesis/approve
 *
 * Nível 4 (ou curador) aprova uma proposta pendente e dispara o
 * repository_dispatch `mielina-curadoria`. A API confere `contentHash`,
 * `baseVersion` e auto-aprovação; o workflow revalida tudo em `main` antes de
 * publicar a revisão v(N+1). Nada é escrito diretamente pela API.
 *
 * Payload: { questionId, proposalId, baseVersion, contentHash }
 */

import {
  DISPATCH_EVENT_TYPE,
  computeContentHash,
  parseQuestionPrefix,
  validateApprovePayload,
  validateCuration,
} from "../../../scripts/curadoria-sintese.mjs";
import { repoFromEnv } from "../../../lib/mielina/data.js";
import { defaultDeps } from "../../../lib/mielina/deps.js";
import { GitHubError } from "../../../lib/mielina/github.js";
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
  assertSubjectBelongsTo,
  dispatchClientFor,
  githubFor,
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
  const validated = validateApprovePayload(payload);
  if (!validated.ok) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Payload de aprovação inválido.", {
      details: validated.errors,
    });
  }
  const value = validated.value;
  guardRateLimit(deps, `approve:${session.authorId}:${clientIp(req)}`, {
    limit: 5,
    windowMs: 60_000,
  });

  const reputation = await loadReputationOrThrow(deps);
  const snapshot = await loadSnapshotOrThrow(deps, value.questionId);
  if (!snapshot) {
    throw new HttpError(404, "SNAPSHOT_NOT_FOUND", "Snapshot da questão não encontrado em main.");
  }

  const gh = githubFor(deps, { token: session.token });
  let comment;
  try {
    comment = await gh.getDiscussionComment(value.proposalId);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new HttpError(404, "PROPOSAL_NOT_FOUND", "Proposta não encontrada no GitHub Discussions.");
    }
    throw error;
  }
  assertSubjectBelongsTo(gh, { discussion: comment.discussion }, value.questionId);

  const observedAt = nowIso(deps);
  const dispatchPayload = {
    action: "approve",
    repo: repoFromEnv(deps),
    questionId: value.questionId,
    prefix: parseQuestionPrefix(value.questionId),
    proposalId: value.proposalId,
    baseVersion: value.baseVersion,
    contentHash: value.contentHash,
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
    proposalComment: {
      body: comment.body,
      authorId: comment.authorId,
      authorHandle: comment.authorHandle,
    },
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
      proposalId: value.proposalId,
      observedAt,
    });
    return;
  }

  // Reconfere o hash localmente (defesa em profundidade contra payload adulterado).
  const recomputed = computeContentHash(
    value.baseVersion,
    extractProposalBody(comment.body),
    extractProposalSource(comment.body)
  );
  if (recomputed !== value.contentHash) {
    throw new HttpError(
      409,
      "CONTENT_HASH_MISMATCH",
      "contentHash não corresponde ao texto/fonte atuais da proposta."
    );
  }

  dispatchPayload.approverTier = outcome.revision.approverTier;
  const dispatcher = dispatchClientFor(deps);
  await dispatcher.dispatchEvent(DISPATCH_EVENT_TYPE, dispatchPayload);

  json(res, 202, {
    ok: true,
    dispatched: true,
    questionId: value.questionId,
    proposalId: value.proposalId,
    baseVersion: value.baseVersion,
    contentHash: value.contentHash,
    approverId: session.authorId,
    observedAt,
  });
}

function extractProposalBody(markdown) {
  const match = String(markdown || "").match(
    /<!--\s*mielina:proposal:v\d+\s+([\s\S]*?)\s*-->/
  );
  if (!match) return "";
  try {
    return String(JSON.parse(match[1]).body || "");
  } catch {
    return "";
  }
}

function extractProposalSource(markdown) {
  const match = String(markdown || "").match(
    /<!--\s*mielina:proposal:v\d+\s+([\s\S]*?)\s*-->/
  );
  if (!match) return "";
  try {
    return String(JSON.parse(match[1]).sourceUrl || "");
  } catch {
    return "";
  }
}

export default route(handle);
