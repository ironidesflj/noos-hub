/**
 * POST /api/mielina/comment
 *
 * Publica a contribuição do visitante na Discussion canônica da questão.
 * O corpo carrega o bloco estruturado versionado independente de idioma
 * (`<!-- mielina:v2 … -->`) + texto legível para humanos. Só devolve sucesso
 * depois que o GitHub confirma o comentário e devolve `subjectId`/`url`.
 */

import { serializeCommentBlock, validateCommentPayload } from "../../scripts/curadoria-sintese.mjs";
import { defaultDeps } from "../../lib/mielina/deps.js";
import { GitHubError } from "../../lib/mielina/github.js";
import { route } from "../../lib/mielina/handler.js";
import {
  HttpError,
  clientIp,
  guardRateLimit,
  json,
  readJsonBody,
  requireEnv,
  requireMethod,
  requireSession,
} from "../../lib/mielina/http.js";
import { loadSnapshot } from "../../lib/mielina/data.js";
import {
  findOrCreateCanonicalDiscussion,
  githubFor,
  nowIso,
  requireQuestionPublished,
} from "../../lib/mielina/routes-common.js";

export async function handle(req, res, deps = defaultDeps()) {
  requireMethod(req, ["POST"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  const session = requireSession(req, deps, { csrf: true });

  const payload = await readJsonBody(req);
  const validated = validateCommentPayload(payload);
  if (!validated.ok) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Contribuição inválida.", {
      details: validated.errors,
    });
  }
  const value = validated.value;
  guardRateLimit(deps, `comment:${session.authorId}:${clientIp(req)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  await requireQuestionPublished(deps, value.questionId);

  const gh = githubFor(deps, { token: session.token });
  const loadedSnapshot = await loadSnapshot(deps, value.questionId);
  const snapshot = loadedSnapshot.ok ? loadedSnapshot.snapshot : null;

  let markdown;
  try {
    markdown = serializeCommentBlock(value);
  } catch (error) {
    throw new HttpError(400, "INVALID_PAYLOAD", error.message);
  }

  let resolved = await findOrCreateCanonicalDiscussion(
    gh,
    deps,
    value.questionId,
    snapshot
  );
  let comment;
  try {
    comment = await gh.addDiscussionComment({
      discussionId: resolved.discussion.id,
      body: markdown,
    });
  } catch (error) {
    // Snapshot desatualizado: refaz o vínculo canônico uma vez e tenta de novo.
    const staleBinding =
      snapshot &&
      snapshot.discussionId &&
      error instanceof GitHubError &&
      (error.status === 404 || error.status === 400);
    if (!staleBinding) throw error;
    resolved = await findOrCreateCanonicalDiscussion(gh, deps, value.questionId, null);
    comment = await gh.addDiscussionComment({
      discussionId: resolved.discussion.id,
      body: markdown,
    });
  }

  json(res, 201, {
    ok: true,
    questionId: value.questionId,
    subjectId: comment.subjectId,
    url: comment.url,
    createdAt: comment.createdAt,
    authorId: session.authorId,
    handle: session.handle,
    discussionId: resolved.discussion.id,
    discussionUrl: resolved.discussion.url || "",
    observedAt: nowIso(deps),
  });
}

export default route(handle);
