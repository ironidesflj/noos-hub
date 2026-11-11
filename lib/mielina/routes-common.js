/**
 * Helpers comuns das rotas /api/mielina/*: sessão já resolvida, cliente GitHub,
 * leitura fail-safe de dados publicados e discussion canônica por questão.
 */

import { randomToken } from "./crypto.js";
import { GitHubClient } from "./github.js";
import { HttpError, requestHeader, requireEnv } from "./http.js";
import {
  loadManifestQuestion,
  loadReputation,
  loadSnapshot,
  repoFromEnv,
} from "./data.js";

/** ISO-8601 do instante observado (injetável nos testes). */
export function nowIso(deps) {
  const value = deps && deps.now ? deps.now() : new Date();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function requestUrl(req, deps) {
  const env = (deps && deps.env) || {};
  const base = String(env.MIELINA_BASE_URL || "https://noos.study");
  return new URL(String((req && req.url) || "/"), base);
}

/**
 * `returnTo` aceito: caminho absoluto same-origin, sem esquema/host, sem
 * controle e com tamanho limitado. Qualquer outra coisa cai no fallback.
 */
export function safeReturnTo(value, fallback = "/") {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const parsed = new URL(raw, "https://noos.study");
    if (parsed.origin !== "https://noos.study") return fallback;
    if (!parsed.pathname.startsWith("/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function clientRepo(deps) {
  return repoFromEnv(deps);
}

/** Cliente GitHub com o token indicado (default: token de serviço). */
export function githubFor(deps, options = {}) {
  const env = (deps && deps.env) || {};
  const token = String(options.token || env.MIELINA_GITHUB_TOKEN || "").trim();
  if (!token) {
    throw new HttpError(
      503,
      "ENV_MISSING",
      "Configuração ausente no servidor: MIELINA_GITHUB_TOKEN."
    );
  }
  return new GitHubClient({
    token,
    repo: clientRepo(deps),
    fetchImpl: deps.fetch,
  });
}

/** Cliente com token que pode disparar repository_dispatch. */
export function dispatchClientFor(deps) {
  const env = (deps && deps.env) || {};
  const token = String(env.MIELINA_DISPATCH_TOKEN || env.MIELINA_GITHUB_TOKEN || "").trim();
  if (!token) {
    throw new HttpError(
      503,
      "ENV_MISSING",
      "Configuração ausente no servidor: MIELINA_DISPATCH_TOKEN ou MIELINA_GITHUB_TOKEN."
    );
  }
  return new GitHubClient({ token, repo: clientRepo(deps), fetchImpl: deps.fetch });
}

export async function loadReputationOrThrow(deps) {
  const loaded = await loadReputation(deps);
  if (!loaded.ok) {
    throw new HttpError(
      503,
      "DATA_UNAVAILABLE",
      "Não foi possível ler a reputação publicada em main."
    );
  }
  return loaded.reputation;
}

export async function loadSnapshotOrThrow(deps, questionId) {
  const loaded = await loadSnapshot(deps, questionId);
  if (!loaded.ok) {
    throw new HttpError(
      503,
      "DATA_UNAVAILABLE",
      "Não foi possível ler o snapshot da questão em main."
    );
  }
  return loaded.snapshot;
}

export async function requireQuestionPublished(deps, questionId) {
  const loaded = await loadManifestQuestion(deps, questionId);
  if (!loaded.ok) {
    throw new HttpError(
      503,
      "DATA_UNAVAILABLE",
      "Não foi possível validar a questão no manifesto público."
    );
  }
  if (!loaded.found) {
    throw new HttpError(404, "QUESTION_NOT_FOUND", "Questão não encontrada no manifesto público.");
  }
  return loaded.record;
}

export function canonicalDiscussionBody(questionId) {
  return [
    `Área de discussão da questão ${questionId}.`,
    "",
    "Este é o fio canônico público desta questão no Noos Hub. As contribuições",
    "publicadas pelo compositor guiado da Camada de Mielina aparecem aqui e",
    "alimentam a página pública da questão.",
  ].join("\n");
}

/**
 * Discussion canônica: usa o `discussionId` do snapshot quando existir; senão
 * garante a criação pelo título (ID público), reaproveitando a mais antiga.
 */
export async function findOrCreateCanonicalDiscussion(gh, deps, questionId, snapshot) {
  if (snapshot && snapshot.discussionId) {
    return {
      discussion: {
        id: String(snapshot.discussionId),
        url: String(snapshot.discussionUrl || ""),
        title: questionId,
      },
      created: false,
    };
  }
  const env = (deps && deps.env) || {};
  requireEnv(env, ["MIELINA_DISCUSSION_CATEGORY_ID"]);
  const repository = await gh.getRepository();
  return gh.ensureDiscussion({
    title: questionId,
    repositoryId: repository.id,
    categoryId: env.MIELINA_DISCUSSION_CATEGORY_ID,
    body: canonicalDiscussionBody(questionId),
  });
}

/** Garante que o subjectId é de uma discussion do repositório e da questão. */
export function assertSubjectBelongsTo(gh, info, questionId) {
  const discussion = info && info.discussion;
  if (!discussion) {
    throw new HttpError(400, "SUBJECT_INVALID", "subjectId não pertence a uma discussion.");
  }
  if (discussion.repository && String(discussion.repository) !== gh.repo) {
    throw new HttpError(400, "SUBJECT_FOREIGN_REPO", "subjectId pertence a outro repositório.");
  }
  if (!discussion.repository && !String(discussion.url || "").includes(`/${gh.repo}/discussions/`)) {
    throw new HttpError(400, "SUBJECT_FOREIGN_REPO", "subjectId pertence a outro repositório.");
  }
  if (questionId && String(discussion.title || "") !== String(questionId)) {
    throw new HttpError(
      400,
      "SUBJECT_QUESTION_MISMATCH",
      "subjectId não pertence à questão informada."
    );
  }
  return info;
}

export function newDispatchId() {
  return `dispatch_${randomToken(12)}`;
}

export { requestHeader };
