/**
 * POST /api/mielina/synthesis/propose
 *
 * Nível 3 (ou curador) propõe revisão da Síntese Wiki. Calcula o
 * `contentHash = sha256(baseVersion + "\\n" + body.trim() + "\\n" + sourceUrl.trim())`
 * e publica a proposta estruturada na discussion canônica da questão, onde a
 * seção de propostas pendentes da Mielina a enxerga.
 */

import {
  computeContentHash,
  getSynthesisVersion,
  serializeProposalBlock,
  validateProposePayload,
} from "../../../scripts/curadoria-sintese.mjs";
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
import { tierOf } from "../../../lib/mielina/data.js";
import {
  findOrCreateCanonicalDiscussion,
  githubFor,
  loadReputationOrThrow,
  loadSnapshotOrThrow,
  nowIso,
  requireQuestionPublished,
} from "../../../lib/mielina/routes-common.js";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["POST"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  const session = requireSession(req, deps, { csrf: true });

  const payload = await readJsonBody(req);
  const validated = validateProposePayload(payload);
  if (!validated.ok) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Proposta de síntese inválida.", {
      details: validated.errors,
    });
  }
  const value = validated.value;
  guardRateLimit(deps, `propose:${session.authorId}:${clientIp(req)}`, {
    limit: 3,
    windowMs: 60_000,
  });
  await requireQuestionPublished(deps, value.questionId);

  const reputation = await loadReputationOrThrow(deps);
  const proposer = tierOf(reputation, session.authorId);
  if (proposer.tier < 3 && !proposer.isCurator) {
    throw new HttpError(
      403,
      "PROPOSER_NOT_TIER3",
      "Apenas Nível 3 ou curador pode propor revisão da Síntese Wiki."
    );
  }

  const snapshot = await loadSnapshotOrThrow(deps, value.questionId);
  if (!snapshot) {
    throw new HttpError(404, "SNAPSHOT_NOT_FOUND", "Snapshot da questão não encontrado em main.");
  }
  const baseVersion = getSynthesisVersion(snapshot);
  if (baseVersion === null) {
    throw new HttpError(409, "SYNTHESIS_MISSING", "A questão ainda não tem Síntese Wiki para revisar.");
  }

  const contentHash = computeContentHash(baseVersion, value.body, value.sourceUrl);
  let markdown;
  try {
    markdown = serializeProposalBlock({
      questionId: value.questionId,
      baseVersion,
      contentHash,
      sourceUrl: value.sourceUrl,
      body: value.body,
    });
  } catch (error) {
    throw new HttpError(400, "INVALID_PAYLOAD", error.message);
  }

  const gh = githubFor(deps, { token: session.token });
  const resolved = await findOrCreateCanonicalDiscussion(
    gh,
    deps,
    value.questionId,
    snapshot
  );
  const comment = await gh.addDiscussionComment({
    discussionId: resolved.discussion.id,
    body: markdown,
  });

  json(res, 201, {
    ok: true,
    questionId: value.questionId,
    proposalId: comment.subjectId,
    contentHash,
    baseVersion,
    url: comment.url,
    createdAt: comment.createdAt,
    proposerId: session.authorId,
    proposerHandle: session.handle,
    tier: proposer.tier,
    discussionId: resolved.discussion.id,
    observedAt: nowIso(deps),
  });
}

export default route(handle);
