/**
 * GET  /api/mielina/support?subjectId=…&questionId=…  (reconciliação)
 * POST /api/mielina/support
 *
 * Apoio "▲ Acelerar": exige sessão; no POST exige Origin + CSRF. O clique
 * adiciona ROCKET; desfazer remove ROCKET/THUMBS_UP/HEART da própria conta.
 * O total devolvido é sempre recalculado no GitHub com a policy única
 * (união de contas humanas, sem bots e sem auto-apoio), nunca somado no
 * cliente. Resposta: { subjectId, count, viewerSupported, observedAt }.
 */

import {
  isValidNodeId,
  isValidQuestionId,
  validateSupportPayload,
} from "../../scripts/curadoria-sintese.mjs";
import { defaultDeps } from "../../lib/mielina/deps.js";
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
import { SUPPORT_REACTIONS, computeUniqueSupporters } from "../../lib/mielina/policy.js";
import {
  assertSubjectBelongsTo,
  githubFor,
  nowIso,
  requestUrl,
} from "../../lib/mielina/routes-common.js";

function summarize(reactions, authorId, viewerId) {
  const supporters = computeUniqueSupporters(reactions, authorId);
  return {
    count: supporters.size,
    viewerSupported: viewerId ? supporters.has(String(viewerId)) : false,
  };
}

async function addReactionTolerant(gh, subjectId) {
  try {
    await gh.addReaction(subjectId, "ROCKET");
  } catch (error) {
    if (error && /already|exist/i.test(String(error.message || ""))) return;
    throw error;
  }
}

async function removeReactionTolerant(gh, subjectId, content) {
  try {
    await gh.removeReaction(subjectId, content);
  } catch (error) {
    if (error && /not found|does not exist|no reaction/i.test(String(error.message || ""))) return;
    throw error;
  }
}

async function readState(gh, subjectId) {
  const info = await gh.getSubject(subjectId);
  const reactions = await gh.getAllReactions(subjectId);
  return { info, reactions };
}

export async function handle(req, res, deps = defaultDeps()) {
  const method = requireMethod(req, ["GET", "POST"]);
  const env = deps.env || {};
  requireEnv(env, ["MIELINA_SESSION_SECRET"]);
  const session = requireSession(req, deps, { csrf: method === "POST" });

  if (method === "GET") {
    const query = requestUrl(req, deps);
    const subjectId = String(query.searchParams.get("subjectId") || "").trim();
    const questionId = String(query.searchParams.get("questionId") || "").trim();
    if (!isValidNodeId(subjectId)) {
      throw new HttpError(400, "INVALID_SUBJECT", "subjectId inválido.");
    }
    if (questionId && !isValidQuestionId(questionId)) {
      throw new HttpError(400, "INVALID_QUESTION", "questionId inválido.");
    }
    const gh = githubFor(deps, { token: session.token });
    const { info, reactions } = await readState(gh, subjectId);
    assertSubjectBelongsTo(gh, info, questionId);
    const summary = summarize(reactions, info.authorId, session.authorId);
    json(res, 200, {
      ok: true,
      subjectId,
      questionId: info.discussion ? info.discussion.title : questionId,
      count: summary.count,
      viewerSupported: summary.viewerSupported,
      observedAt: nowIso(deps),
    });
    return;
  }

  const payload = await readJsonBody(req);
  const validated = validateSupportPayload(payload);
  if (!validated.ok) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Payload de apoio inválido.", {
      details: validated.errors,
    });
  }
  const value = validated.value;
  guardRateLimit(deps, `support:${session.authorId}:${clientIp(req)}`, {
    limit: 30,
    windowMs: 60_000,
  });

  const gh = githubFor(deps, { token: session.token });
  const before = await readState(gh, value.subjectId);
  const info = assertSubjectBelongsTo(gh, before.info, value.questionId);

  if (value.desiredState && String(info.authorId) === String(session.authorId)) {
    throw new HttpError(403, "SELF_SUPPORT", "Você não pode acelerar sua própria contribuição.");
  }

  if (value.desiredState) {
    await addReactionTolerant(gh, value.subjectId);
  } else {
    const mine = before.reactions.filter(
      (reaction) =>
        reaction &&
        reaction.user &&
        String(reaction.user.id) === String(session.authorId) &&
        SUPPORT_REACTIONS.includes(String(reaction.content || ""))
    );
    const contents = [...new Set(mine.map((reaction) => String(reaction.content)))];
    for (const content of contents) {
      await removeReactionTolerant(gh, value.subjectId, content);
    }
  }

  // Reconsulta depois da mutação: o contador é o estado real do GitHub.
  const after = await gh.getAllReactions(value.subjectId);
  const summary = summarize(after, info.authorId, session.authorId);
  json(res, 200, {
    ok: true,
    subjectId: value.subjectId,
    questionId: value.questionId,
    count: summary.count,
    viewerSupported: summary.viewerSupported,
    observedAt: nowIso(deps),
  });
}

export default route(handle);
