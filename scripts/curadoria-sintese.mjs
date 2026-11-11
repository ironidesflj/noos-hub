/**
 * curadoria-sintese — validação pura e formatação da Camada de Mielina v2.
 *
 * Fonte única (PURA) das regras usadas pela API Vercel (/api/mielina/*) e pelo
 * workflow de curadoria (.github/workflows/curadoria-sintese.yml):
 * - blocos estruturados versionados (`<!-- mielina:v2 ... -->` e propostas);
 * - hash de conteúdo (`sha256:<hex>`) de propostas de síntese;
 * - validação de payloads de entrada;
 * - gates de curadoria revalidados em `main` (permissões, versão, hash,
 *   auto-aprovação e idempotência por `originCommentId`).
 *
 * Sem rede, sem estado global mutável, sem segredos. Determinístico: as mesmas
 * entradas produzem as mesmas saídas. Este arquivo também é executável como CLI
 * (`--apply`) — a parte de rede/commit vive no fim, fora das funções puras.
 */

import { createHash } from "node:crypto";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeAuthorTier } from "../build/lib/mielina-policy.mjs";

/** Versão do bloco estruturado de contribuição. */
export const MIELINA_BLOCK_VERSION = 2;
/** Versão do bloco estruturado de proposta de síntese. */
export const MIELINA_PROPOSAL_VERSION = 2;
/** Tipo do repository_dispatch disparado pela API e consumido pelo workflow. */
export const DISPATCH_EVENT_TYPE = "mielina-curadoria";

/** ID público de questão: PREFIXO-EXAM-SEQ (ex.: RAN-DBDEA-00001). */
export const QUESTION_ID_RE = /^[A-Z][A-Z0-9]{1,7}-[A-Z0-9]{2,16}-\d{5}$/;
/** Prefixo público de manifesto (RAN, SYN, …). */
export const PREFIX_RE = /^[A-Z][A-Z0-9]{1,7}$/;
/** Node ID do GitHub (Discussion D_… / DiscussionComment DC_…). */
export const NODE_ID_RE = /^(D|DC)_[A-Za-z0-9]+$/;
/** Hash de conteúdo no formato publicado. */
export const CONTENT_HASH_RE = /^sha256:[a-f0-9]{64}$/;
/** Opções aceitas no compositor guiado. */
export const OPTIONS = Object.freeze(["A", "B", "C", "D", "Geral"]);

export const LIMITS = Object.freeze({
  commentBodyMin: 15,
  commentBodyMax: 5000,
  proposalBodyMin: 30,
  proposalBodyMax: 4000,
  sourceUrlMax: 2048,
  reasonMin: 10,
  reasonMax: 500,
  questionIdMax: 64,
});

/** Erro de entrada inválida para serialização (mapeado para 400 na API). */
export class CurationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "CurationInputError";
    this.code = "INVALID_INPUT";
  }
}

const DEFAULT_POLICY = Object.freeze({ computeAuthorTier });

/* ------------------------------------------------------------------ básicos */

export function sha256Hex(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

/** Normaliza o payload de hash exatamente como o contrato: versão, texto e fonte. */
export function contentHashPayload(baseVersion, body, sourceUrl) {
  return `${baseVersion}\n${String(body ?? "").trim()}\n${String(sourceUrl ?? "").trim()}`;
}

/** `sha256:<hex>` da proposta de síntese (baseVersion + texto + fonte). */
export function computeContentHash(baseVersion, body, sourceUrl) {
  if (!Number.isInteger(Number(baseVersion)) || Number(baseVersion) < 1) {
    throw new CurationInputError("baseVersion inválida para contentHash");
  }
  return `sha256:${sha256Hex(contentHashPayload(Number(baseVersion), body, sourceUrl))}`;
}

export function isValidContentHash(value) {
  return CONTENT_HASH_RE.test(String(value || ""));
}

export function parseQuestionPrefix(questionId) {
  const id = String(questionId || "");
  if (!QUESTION_ID_RE.test(id)) return "";
  return id.slice(0, id.indexOf("-"));
}

export function isValidQuestionId(questionId) {
  return QUESTION_ID_RE.test(String(questionId || ""));
}

export function isValidNodeId(value) {
  return NODE_ID_RE.test(String(value || ""));
}

/**
 * Normaliza e valida uma URL de fonte. Vazia é permitida (comentário sem fonte).
 * Somente https, sem credenciais embutidas, dentro do limite de tamanho.
 */
export function normalizeSourceUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: "" };
  if (raw.length > LIMITS.sourceUrlMax) {
    return { ok: false, error: "Fonte excede o tamanho máximo permitido." };
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Fonte precisa ser uma URL válida." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Fonte precisa ser https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Fonte não pode conter credenciais." };
  }
  if (!parsed.hostname) {
    return { ok: false, error: "Fonte sem host válido." };
  }
  return { ok: true, value: parsed.toString() };
}

/** Não permitimos sequências que quebrariam o comentário HTML do bloco. */
function assertBlockSafe(text, label) {
  if (String(text).includes("-->") || String(text).includes("<!--")) {
    throw new CurationInputError(`${label} não pode conter "<!--" nem "-->".`);
  }
}

/* ------------------------------------------------------- blocos estruturados */

/**
 * Serializa uma contribuição no bloco versionado + texto legível. O bloco JSON
 * é independente de idioma; o restante mantém a leitura humana no GitHub.
 */
export function serializeCommentBlock(input) {
  const data = input || {};
  const questionId = String(data.questionId || "");
  if (!isValidQuestionId(questionId)) throw new CurationInputError("questionId inválido.");
  const option = OPTIONS.includes(String(data.option)) ? String(data.option) : "Geral";
  const body = String(data.body ?? "").trim();
  if (body.length < LIMITS.commentBodyMin || body.length > LIMITS.commentBodyMax) {
    throw new CurationInputError("Texto da contribuição fora do tamanho permitido.");
  }
  const source = normalizeSourceUrl(data.sourceUrl);
  if (!source.ok) throw new CurationInputError(source.error);
  assertBlockSafe(body, "Texto da contribuição");

  const payload = {
    v: MIELINA_BLOCK_VERSION,
    questionId,
    option,
    selfDeclaredPassed: data.selfDeclaredPassed === true,
    sourceUrl: source.value,
    body,
  };
  const status = payload.selfDeclaredPassed
    ? "✦ Passei na prova (autodeclarado)"
    : "Estudando agora";
  const lines = [
    `<!-- mielina:v${MIELINA_BLOCK_VERSION} ${JSON.stringify(payload)} -->`,
    "",
    `**Alternativa que confundiu:** ${payload.option}`,
    `**Status:** ${status}`,
    "",
    "**O que a documentação oficial não conta de primeira:**",
    payload.body,
  ];
  if (payload.sourceUrl) {
    lines.push("", `**Fonte oficial:** ${payload.sourceUrl}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Extrai e valida o bloco `<!-- mielina:v2 ... -->` de um comentário. */
export function parseCommentBlock(markdown) {
  const text = String(markdown || "");
  const match = text.match(/<!--\s*mielina:v(\d+)\s+([\s\S]*?)\s*-->/);
  if (!match) return { ok: false, error: "Bloco estruturado mielina ausente." };
  if (Number(match[1]) !== MIELINA_BLOCK_VERSION) {
    return { ok: false, error: `Versão de bloco não suportada: v${match[1]}.` };
  }
  let payload;
  try {
    payload = JSON.parse(match[2]);
  } catch {
    return { ok: false, error: "Bloco estruturado não é JSON válido." };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Bloco estruturado em formato inesperado." };
  }
  if (!isValidQuestionId(payload.questionId)) {
    return { ok: false, error: "Bloco estruturado com questionId inválido." };
  }
  const body = String(payload.body ?? "").trim();
  if (!body) return { ok: false, error: "Bloco estruturado sem texto." };
  return {
    ok: true,
    value: {
      v: MIELINA_BLOCK_VERSION,
      questionId: String(payload.questionId),
      option: OPTIONS.includes(String(payload.option)) ? String(payload.option) : "Geral",
      selfDeclaredPassed: payload.selfDeclaredPassed === true,
      sourceUrl: String(payload.sourceUrl || ""),
      body,
    },
  };
}

/** Serializa uma proposta de revisão da Síntese Wiki (Nível 3+). */
export function serializeProposalBlock(input) {
  const data = input || {};
  const questionId = String(data.questionId || "");
  if (!isValidQuestionId(questionId)) throw new CurationInputError("questionId inválido.");
  const body = String(data.body ?? "").trim();
  if (body.length < LIMITS.proposalBodyMin || body.length > LIMITS.proposalBodyMax) {
    throw new CurationInputError("Texto da proposta fora do tamanho permitido.");
  }
  const source = normalizeSourceUrl(data.sourceUrl);
  if (!source.ok) throw new CurationInputError(source.error);
  if (!source.value) throw new CurationInputError("Proposta exige fonte oficial https://.");
  assertBlockSafe(body, "Texto da proposta");
  const baseVersion = Number(data.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) {
    throw new CurationInputError("baseVersion inválida.");
  }
  const contentHash = isValidContentHash(data.contentHash)
    ? String(data.contentHash)
    : computeContentHash(baseVersion, body, source.value);
  const payload = {
    v: MIELINA_PROPOSAL_VERSION,
    questionId,
    baseVersion,
    contentHash,
    sourceUrl: source.value,
    body,
  };
  return [
    `<!-- mielina:proposal:v${MIELINA_PROPOSAL_VERSION} ${JSON.stringify(payload)} -->`,
    "",
    `**Proposta de revisão da Síntese Wiki (base v${baseVersion})**`,
    "",
    payload.body,
    "",
    `**Fonte oficial:** ${payload.sourceUrl}`,
    "",
  ].join("\n");
}

/** Extrai e valida o bloco `<!-- mielina:proposal:v2 ... -->` de um comentário. */
export function parseProposalBlock(markdown) {
  const text = String(markdown || "");
  const match = text.match(/<!--\s*mielina:proposal:v(\d+)\s+([\s\S]*?)\s*-->/);
  if (!match) return { ok: false, error: "Bloco de proposta mielina ausente." };
  if (Number(match[1]) !== MIELINA_PROPOSAL_VERSION) {
    return { ok: false, error: `Versão de proposta não suportada: v${match[1]}.` };
  }
  let payload;
  try {
    payload = JSON.parse(match[2]);
  } catch {
    return { ok: false, error: "Bloco de proposta não é JSON válido." };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Bloco de proposta em formato inesperado." };
  }
  if (!isValidQuestionId(payload.questionId)) {
    return { ok: false, error: "Proposta com questionId inválido." };
  }
  const baseVersion = Number(payload.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) {
    return { ok: false, error: "Proposta com baseVersion inválida." };
  }
  const body = String(payload.body ?? "").trim();
  if (!body) return { ok: false, error: "Proposta sem texto." };
  const source = normalizeSourceUrl(payload.sourceUrl);
  if (!source.ok || !source.value) {
    return { ok: false, error: "Proposta com fonte inválida." };
  }
  const recomputed = computeContentHash(baseVersion, body, source.value);
  const declared = String(payload.contentHash || "");
  if (declared && declared !== recomputed) {
    return {
      ok: false,
      error: "contentHash declarado não corresponde ao texto/fonte atuais (proposta editada?).",
      contentHashMismatch: true,
    };
  }
  return {
    ok: true,
    value: {
      v: MIELINA_PROPOSAL_VERSION,
      questionId: String(payload.questionId),
      baseVersion,
      contentHash: recomputed,
      sourceUrl: source.value,
      body,
    },
  };
}

/* ----------------------------------------------------- validação de payloads */

function result(errors, value) {
  return errors.length
    ? { ok: false, errors, value: null }
    : { ok: true, errors: [], value };
}

function isNonEmptyString(value, max = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function normalizeHandle(value) {
  const handle = String(value || "").trim();
  if (!handle) return "";
  return handle.startsWith("@") ? handle : `@${handle}`;
}

export function validateSupportPayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  if (!isValidNodeId(data.subjectId)) errors.push("subjectId inválido.");
  if (typeof data.desiredState !== "boolean") errors.push("desiredState deve ser booleano.");
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  return result(errors, {
    subjectId: String(data.subjectId || ""),
    desiredState: data.desiredState === true,
    questionId: String(data.questionId || ""),
  });
}

export function validateCommentPayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  const option = String(data.option ?? "Geral");
  if (!OPTIONS.includes(option)) errors.push("option deve ser A, B, C, D ou Geral.");
  const body = String(data.body ?? "").trim();
  if (body.length < LIMITS.commentBodyMin || body.length > LIMITS.commentBodyMax) {
    errors.push(
      `Texto da contribuição deve ter entre ${LIMITS.commentBodyMin} e ${LIMITS.commentBodyMax} caracteres.`
    );
  }
  if (typeof data.selfDeclaredPassed !== "boolean") {
    errors.push("selfDeclaredPassed deve ser booleano.");
  }
  const source = normalizeSourceUrl(data.sourceUrl);
  if (!source.ok) errors.push(source.error);
  if (body.includes("-->") || body.includes("<!--")) {
    errors.push('Texto não pode conter "<!--" nem "-->".');
  }
  return result(errors, {
    questionId: String(data.questionId || ""),
    option,
    body,
    selfDeclaredPassed: data.selfDeclaredPassed === true,
    sourceUrl: source.ok ? source.value : "",
  });
}

export function validateProposePayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  const body = String(data.body ?? "").trim();
  if (body.length < LIMITS.proposalBodyMin || body.length > LIMITS.proposalBodyMax) {
    errors.push(
      `Texto da proposta deve ter entre ${LIMITS.proposalBodyMin} e ${LIMITS.proposalBodyMax} caracteres.`
    );
  }
  const source = normalizeSourceUrl(data.sourceUrl);
  if (!source.ok) errors.push(source.error);
  if (source.ok && !source.value) errors.push("Proposta exige fonte https://.");
  if (body.includes("-->") || body.includes("<!--")) {
    errors.push('Texto não pode conter "<!--" nem "-->".');
  }
  return result(errors, {
    questionId: String(data.questionId || ""),
    body,
    sourceUrl: source.ok ? source.value : "",
  });
}

export function validateApprovePayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  if (!isValidNodeId(data.proposalId)) errors.push("proposalId inválido (esperado DC_…).");
  const baseVersion = Number(data.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) {
    errors.push("baseVersion deve ser inteiro >= 1.");
  }
  if (!isValidContentHash(data.contentHash)) {
    errors.push("contentHash inválido (esperado sha256:<64 hex>).");
  }
  return result(errors, {
    questionId: String(data.questionId || ""),
    proposalId: String(data.proposalId || ""),
    baseVersion: Number.isInteger(baseVersion) ? baseVersion : 0,
    contentHash: String(data.contentHash || ""),
  });
}

export function validateRevertPayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  const baseVersion = Number(data.baseVersion);
  const targetVersion = Number(data.targetVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) errors.push("baseVersion inválido.");
  if (!Number.isInteger(targetVersion) || targetVersion < 1) errors.push("targetVersion inválido.");
  if (Number.isInteger(baseVersion) && Number.isInteger(targetVersion) && targetVersion >= baseVersion) {
    errors.push("targetVersion deve ser menor que baseVersion.");
  }
  const reason = String(data.reason ?? "").trim();
  if (reason.length < LIMITS.reasonMin || reason.length > LIMITS.reasonMax) {
    errors.push(`reason deve ter entre ${LIMITS.reasonMin} e ${LIMITS.reasonMax} caracteres.`);
  }
  return result(errors, {
    questionId: String(data.questionId || ""),
    baseVersion: Number.isInteger(baseVersion) ? baseVersion : 0,
    targetVersion: Number.isInteger(targetVersion) ? targetVersion : 0,
    reason,
  });
}

/**
 * Valida o client_payload do repository_dispatch `mielina-curadoria`.
 * Nunca confia no payload: o workflow revalida tudo em `main`.
 */
export function validateDispatchPayload(input) {
  const data = input && typeof input === "object" ? input : {};
  const errors = [];
  const action = String(data.action || "");
  if (action !== "approve" && action !== "revert") {
    errors.push('action deve ser "approve" ou "revert".');
  }
  if (!isNonEmptyString(data.repo, 128) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(data.repo))) {
    errors.push("repo inválido (esperado owner/name).");
  }
  if (!isValidQuestionId(data.questionId)) errors.push("questionId inválido.");
  if (!isNonEmptyString(data.approverId, 128)) errors.push("approverId ausente.");
  const baseVersion = Number(data.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) errors.push("baseVersion inválido.");
  if (data.dispatchId != null && !isNonEmptyString(data.dispatchId, 128)) {
    errors.push("dispatchId inválido.");
  }
  if (action === "approve") {
    if (!isValidNodeId(data.proposalId)) errors.push("proposalId inválido.");
    if (!isValidContentHash(data.contentHash)) errors.push("contentHash inválido.");
  }
  if (action === "revert") {
    const targetVersion = Number(data.targetVersion);
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      errors.push("targetVersion inválido.");
    }
    if (Number.isInteger(targetVersion) && Number.isInteger(baseVersion) && targetVersion >= baseVersion) {
      errors.push("targetVersion deve ser menor que baseVersion.");
    }
    const reason = String(data.reason ?? "").trim();
    if (reason.length < LIMITS.reasonMin || reason.length > LIMITS.reasonMax) {
      errors.push("reason fora do tamanho permitido.");
    }
  }
  const value = {
    action,
    repo: String(data.repo || ""),
    questionId: String(data.questionId || ""),
    prefix: parseQuestionPrefix(data.questionId),
    approverId: String(data.approverId || ""),
    approverHandle: normalizeHandle(data.approverHandle),
    baseVersion: Number.isInteger(baseVersion) ? baseVersion : 0,
    contentHash: String(data.contentHash || ""),
    proposalId: String(data.proposalId || ""),
    targetVersion: Number(data.targetVersion) || 0,
    reason: String(data.reason ?? "").trim(),
    override: data.override === "maintainer-exception" ? "maintainer-exception" : "",
    dispatchId: String(data.dispatchId || ""),
    requestedAt: String(data.requestedAt || ""),
  };
  return result(errors, value);
}

/* -------------------------------------------------------- estado e reputação */

export function normalizeReputation(doc) {
  const out = { curators: [], authors: {}, verifiedOfficialUrls: [] };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return out;

  let rawCurators = [];
  if (Array.isArray(doc.curators)) rawCurators = doc.curators;
  else if (doc.curators && typeof doc.curators === "object") {
    rawCurators = Object.entries(doc.curators).map(([authorId, value]) =>
      value && typeof value === "object" ? { authorId, ...value } : { authorId, role: value }
    );
  }
  for (const item of rawCurators) {
    if (typeof item === "string") {
      out.curators.push({ authorId: item, handle: "", role: "maintainer-curator" });
    } else if (item && typeof item === "object") {
      const authorId = String(item.authorId || item.id || "").trim();
      if (!authorId) continue;
      out.curators.push({
        authorId,
        handle: normalizeHandle(item.handle),
        role: String(item.role || "maintainer-curator"),
      });
    }
  }

  if (doc.authors && typeof doc.authors === "object" && !Array.isArray(doc.authors)) {
    for (const [authorId, metrics] of Object.entries(doc.authors)) {
      if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
        out.authors[String(authorId)] = metrics;
      }
    }
  }
  if (Array.isArray(doc.verifiedOfficialUrls)) {
    out.verifiedOfficialUrls = doc.verifiedOfficialUrls.filter((url) => typeof url === "string");
  }
  return out;
}

export function findCurator(reputation, authorId) {
  const rep = reputation && Array.isArray(reputation.curators) ? reputation : normalizeReputation(reputation);
  const id = String(authorId || "");
  if (!id) return null;
  return rep.curators.find((curator) => String(curator.authorId) === id) || null;
}

/** Tier do autor segundo a policy única (`build/lib/mielina-policy.mjs`). */
export function getAuthorTier(reputation, authorId, policy = DEFAULT_POLICY) {
  const rep = reputation && Array.isArray(reputation.curators) ? reputation : normalizeReputation(reputation);
  const curator = findCurator(rep, authorId);
  const metrics = rep.authors[String(authorId || "")] || {};
  const raw = Number(policy.computeAuthorTier(metrics, {
    isCurator: Boolean(curator),
    role: curator ? curator.role : "",
  }));
  const tier = Number.isFinite(raw) ? Math.min(4, Math.max(1, Math.trunc(raw))) : 1;
  return { tier, isCurator: Boolean(curator), metrics };
}

export function getSynthesis(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const synthesis = snapshot.synthesis;
  return synthesis && typeof synthesis === "object" ? synthesis : null;
}

export function getSynthesisVersion(snapshot) {
  const synthesis = getSynthesis(snapshot);
  if (!synthesis) return null;
  const version = Number(synthesis.version);
  return Number.isInteger(version) && version >= 1 ? version : null;
}

export function findPendingProposal(snapshot, proposalId) {
  const synthesis = getSynthesis(snapshot);
  const list = synthesis && Array.isArray(synthesis.pendingProposals) ? synthesis.pendingProposals : [];
  return list.find((proposal) => String(proposal.proposalId) === String(proposalId)) || null;
}

export function findRevisionByVersion(snapshot, version) {
  const synthesis = getSynthesis(snapshot);
  const list = synthesis && Array.isArray(synthesis.revisions) ? synthesis.revisions : [];
  return list.find((revision) => Number(revision.version) === Number(version)) || null;
}

export function hasAppliedProposal(snapshot, proposalId) {
  const synthesis = getSynthesis(snapshot);
  const list = synthesis && Array.isArray(synthesis.revisions) ? synthesis.revisions : [];
  return list.some((revision) => String(revision.originCommentId) === String(proposalId));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function contributorEntry(authorId, handle) {
  return { authorId: String(authorId), handle: normalizeHandle(handle) };
}

function mergeContributors(existing, addition) {
  const list = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
  if (!addition || !addition.authorId) return list;
  const index = list.findIndex((item) => String(item.authorId) === String(addition.authorId));
  if (index === -1) list.push(addition);
  else if (!list[index].handle && addition.handle) list[index].handle = addition.handle;
  return list;
}

function deny(status, code, message, extra = {}) {
  return { ok: false, status, code, message, errors: [message], ...extra };
}

/**
 * Aplica (sem mutar a entrada) uma aprovação ou reversão, revalidando TODOS os
 * gates contra `reputation` + `snapshot` de `main` e, quando houver, contra o
 * comentário da proposta no GitHub.
 *
 * Retorna `{ ok, status, code, message, errors, noop, snapshot, revision }`.
 * `noop: true` significa replay idempotente (nada a fazer, sucesso).
 */
export function validateCuration(input = {}) {
  const {
    payload,
    reputation,
    snapshot,
    proposalComment = null,
    now = new Date().toISOString(),
    policy = DEFAULT_POLICY,
  } = input;

  const validated = validateDispatchPayload(payload);
  if (!validated.ok) {
    return deny(422, "INVALID_PAYLOAD", "Payload de curadoria inválido.", {
      errors: validated.errors,
    });
  }
  const event = validated.value;

  if (!snapshot || typeof snapshot !== "object") {
    return deny(404, "SNAPSHOT_NOT_FOUND", "Snapshot da questão não encontrado em main.");
  }
  const synthesis = getSynthesis(snapshot);
  if (!synthesis) {
    return deny(409, "SYNTHESIS_MISSING", "A questão ainda não tem Síntese Wiki para curar.");
  }
  const currentVersion = getSynthesisVersion(snapshot);
  if (currentVersion === null) {
    return deny(422, "SNAPSHOT_INVALID", "synthesis.version ausente ou inválida no snapshot.");
  }

  // Idempotência ANTES de checar versão/permissão: uma entrega repetida do
  // mesmo dispatch não deve virar conflito nem ser reaplicada.
  const alreadyApplied =
    event.action === "approve"
      ? hasAppliedProposal(snapshot, event.proposalId)
      : Boolean(
          event.dispatchId &&
            (Array.isArray(synthesis.revisions) ? synthesis.revisions : []).some(
              (revision) => String(revision.dispatchId) === event.dispatchId
            )
        );
  if (alreadyApplied) {
    return {
      ok: true,
      status: 200,
      code: "ALREADY_APPLIED",
      message:
        event.action === "approve"
          ? "Proposta já publicada em revisão anterior (idempotente)."
          : "Reversão já aplicada (idempotente).",
      errors: [],
      noop: true,
      snapshot,
      revision: null,
      action: event.action,
    };
  }

  const rep = normalizeReputation(reputation);
  const approver = getAuthorTier(rep, event.approverId, policy);
  if (approver.tier < 4 && !approver.isCurator) {
    return deny(403, "APPROVER_NOT_TIER4", "Aprovador não é Nível 4 nem curador em main.");
  }

  if (event.baseVersion !== currentVersion) {
    return deny(
      409,
      "VERSION_CONFLICT",
      `Conflito de versão: a síntese está na v${currentVersion} e a ação se baseia na v${event.baseVersion}.`
    );
  }

  if (event.action === "approve") return validateApproval({
    event, rep, synthesis, snapshot, currentVersion, approver, proposalComment, now, policy,
  });
  return validateRevert({
    event, rep, synthesis, snapshot, currentVersion, approver, now, policy,
  });
}

function validateApproval(ctx) {
  const { event, rep, synthesis, snapshot, currentVersion, approver, proposalComment, now, policy } = ctx;

  if (hasAppliedProposal(snapshot, event.proposalId)) {
    return {
      ok: true,
      status: 200,
      code: "ALREADY_APPLIED",
      message: "Proposta já publicada em revisão anterior (idempotente).",
      errors: [],
      noop: true,
      snapshot,
      revision: null,
      action: "approve",
    };
  }

  const stored = findPendingProposal(snapshot, event.proposalId);
  if (!proposalComment || typeof proposalComment !== "object") {
    return deny(409, "PROPOSAL_UNAVAILABLE", "Comentário da proposta não pôde ser lido no GitHub.");
  }
  const parsed = parseProposalBlock(proposalComment.body);
  if (!parsed.ok) {
    return deny(
      409,
      "PROPOSAL_INVALID",
      `Proposta inválida ou editada: ${parsed.error}`
    );
  }
  const block = parsed.value;
  if (block.questionId !== event.questionId) {
    return deny(409, "PROPOSAL_QUESTION_MISMATCH", "Proposta pertence a outra questão.");
  }
  if (block.baseVersion !== event.baseVersion) {
    return deny(409, "PROPOSAL_BASE_MISMATCH", "Proposta não se baseia na versão aprovada.");
  }
  if (block.contentHash !== event.contentHash) {
    return deny(
      409,
      "CONTENT_HASH_MISMATCH",
      "O texto/fonte atuais da proposta não correspondem ao contentHash aprovado (proposta editada após a aprovação?)."
    );
  }
  if (stored) {
    if (stored.contentHash && String(stored.contentHash) !== event.contentHash) {
      return deny(409, "PROPOSAL_STATE_MISMATCH", "contentHash diverge do estado publicado da proposta.");
    }
    if (stored.baseVersion && Number(stored.baseVersion) !== event.baseVersion) {
      return deny(409, "PROPOSAL_STATE_MISMATCH", "baseVersion diverge do estado publicado da proposta.");
    }
  }

  const proposerId = String(proposalComment.authorId || (stored && stored.proposerId) || "");
  const proposerHandle = normalizeHandle(
    proposalComment.authorHandle || (stored && stored.proposerHandle) || ""
  );
  if (!proposerId) {
    return deny(409, "PROPOSAL_AUTHOR_UNKNOWN", "Não foi possível confirmar o autor da proposta.");
  }
  if (stored && stored.proposerId && String(stored.proposerId) !== proposerId) {
    return deny(409, "PROPOSAL_AUTHOR_MISMATCH", "Autor do comentário diverge do estado publicado.");
  }

  let override = "";
  if (proposerId === event.approverId) {
    const isMaintainerOverride = event.override === "maintainer-exception" && approver.isCurator;
    if (!isMaintainerOverride) {
      return deny(403, "SELF_APPROVAL_FORBIDDEN", "Uma conta não pode aprovar a própria proposta.");
    }
    override = "maintainer-exception";
  }

  const proposer = getAuthorTier(rep, proposerId, policy);
  if (proposer.tier < 3 && !proposer.isCurator) {
    return deny(403, "PROPOSER_NOT_TIER3", "Proponente não é Nível 3 em main.");
  }

  const revision = {
    version: currentVersion + 1,
    body: block.body,
    sourceUrl: block.sourceUrl,
    proposerId,
    proposerHandle,
    approverId: event.approverId,
    approverHandle: event.approverHandle,
    approverTier: approver.tier,
    contentHash: event.contentHash,
    createdAt: now,
    originCommentId: event.proposalId,
  };
  if (override) revision.override = override;

  const updatedSynthesis = {
    ...clone(synthesis),
    version: revision.version,
    body: revision.body,
    sourceUrl: revision.sourceUrl,
    updatedAt: now,
    revisions: [...(Array.isArray(synthesis.revisions) ? clone(synthesis.revisions) : []), revision],
    pendingProposals: (Array.isArray(synthesis.pendingProposals) ? clone(synthesis.pendingProposals) : [])
      .filter((proposal) => String(proposal.proposalId) !== event.proposalId),
    contributors: mergeContributors(
      synthesis.contributors,
      contributorEntry(proposerId, proposerHandle)
    ),
  };
  return {
    ok: true,
    status: 200,
    code: "APPROVED",
    message: `Proposta aprovada: síntese v${currentVersion} → v${revision.version}.`,
    errors: [],
    noop: false,
    snapshot: { ...snapshot, synthesis: updatedSynthesis, observedAt: now },
    revision,
    action: "approve",
  };
}

function validateRevert(ctx) {
  const { event, rep, synthesis, snapshot, currentVersion, approver, now, policy } = ctx;

  const revisions = Array.isArray(synthesis.revisions) ? synthesis.revisions : [];
  const replays = revisions.some((revision) => {
    if (!event.dispatchId || !revision.dispatchId) return false;
    return String(revision.dispatchId) === event.dispatchId;
  });
  if (replays) {
    return {
      ok: true,
      status: 200,
      code: "ALREADY_APPLIED",
      message: "Reversão já aplicada (idempotente).",
      errors: [],
      noop: true,
      snapshot,
      revision: null,
      action: "revert",
    };
  }

  const target = findRevisionByVersion(snapshot, event.targetVersion);
  if (!target) {
    return deny(404, "TARGET_VERSION_NOT_FOUND", `Versão v${event.targetVersion} não existe no histórico.`);
  }
  if (Number(target.version) >= currentVersion) {
    return deny(409, "TARGET_NOT_OLDER", "Só é possível restaurar uma versão anterior à atual.");
  }

  const restoredContentHash = computeContentHash(
    event.baseVersion,
    target.body,
    target.sourceUrl
  );
  const revision = {
    version: currentVersion + 1,
    body: String(target.body || ""),
    sourceUrl: String(target.sourceUrl || ""),
    proposerId: event.approverId,
    proposerHandle: event.approverHandle,
    approverId: event.approverId,
    approverHandle: event.approverHandle,
    approverTier: approver.tier,
    contentHash: restoredContentHash,
    createdAt: now,
    originCommentId: null,
    restoredFrom: event.targetVersion,
    reason: event.reason,
  };
  if (event.dispatchId) revision.dispatchId = event.dispatchId;

  const updatedSynthesis = {
    ...clone(synthesis),
    version: revision.version,
    body: revision.body,
    sourceUrl: revision.sourceUrl,
    updatedAt: now,
    revisions: [...clone(revisions), revision],
    contributors: mergeContributors(
      synthesis.contributors,
      target.proposerId ? contributorEntry(target.proposerId, target.proposerHandle) : null
    ),
  };
  return {
    ok: true,
    status: 200,
    code: "REVERTED",
    message: `Síntese restaurada da v${event.targetVersion}: v${currentVersion} → v${revision.version}.`,
    errors: [],
    noop: false,
    snapshot: { ...snapshot, synthesis: updatedSynthesis, observedAt: now },
    revision,
    action: "revert",
  };
}

/* --------------------------------------------------------------- CLI (rede) */

function emitStepSummary(lines) {
  const text = `${lines.join("\n")}\n`;
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) {
    try {
      appendFileSync(target, text);
      return;
    } catch {
      /* cai para stdout abaixo */
    }
  }
  process.stdout.write(text);
}

function failSummary(message, details) {
  const lines = [`## Curadoria da Síntese — falhou`, "", message];
  if (Array.isArray(details) && details.length) {
    lines.push("", "Erros:", ...details.map((item) => `- ${item}`));
  }
  emitStepSummary(lines);
  console.log(`::error::${message}`);
}

function okSummary(result) {
  const lines = ["## Curadoria da Síntese", "", result.message];
  if (result.revision) {
    lines.push(
      "",
      `- Questão: \`${result.revision.originCommentId ? result.revision.originCommentId : "-"}\``,
      `- Nova versão: v${result.revision.version}`,
      `- contentHash: \`${result.revision.contentHash}\``
    );
  }
  emitStepSummary(lines);
}

async function runApply() {
  const { GitHubClient } = await import("../lib/mielina/github.js");
  const token = process.env.MIELINA_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  const repo = process.env.MIELINA_REPO || process.env.GITHUB_REPOSITORY || "";
  const eventPath = process.env.GITHUB_EVENT_PATH || "";
  if (!token) return failAndExit("GITHUB_TOKEN ausente no workflow.");
  if (!repo) return failAndExit("GITHUB_REPOSITORY ausente no workflow.");
  if (!eventPath || !existsSync(eventPath)) {
    return failAndExit("GITHUB_EVENT_PATH ausente no workflow.");
  }

  let event;
  try {
    event = JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (error) {
    return failAndExit(`Evento do GitHub inválido: ${error.message}`);
  }
  const payload = event && event.client_payload ? event.client_payload : {};
  const validated = validateDispatchPayload(payload);
  if (!validated.ok) {
    return failAndExit("Payload do repository_dispatch inválido.", validated.errors);
  }
  const dispatch = validated.value;
  if (dispatch.repo !== repo) {
    return failAndExit(
      `repo do payload (${dispatch.repo}) diverge do repositório do workflow (${repo}).`
    );
  }

  const gh = new GitHubClient({ token, repo });
  let reputationText;
  let snapshotText;
  try {
    [reputationText, snapshotText] = await Promise.all([
      gh.getRepoFileText("discussao/reputation.json", "main"),
      gh.getRepoFileText(`discussao/${dispatch.prefix}.json`, "main"),
    ]);
  } catch (error) {
    return failAndExit(`Falha ao reler dados de main: ${error.message}`);
  }

  let reputation;
  let document;
  try {
    reputation = JSON.parse(reputationText || "{}");
    document = JSON.parse(snapshotText || "{}");
  } catch (error) {
    return failAndExit(`JSON inválido em main: ${error.message}`);
  }
  const snapshot = document && document[dispatch.questionId] ? document[dispatch.questionId] : null;

  let proposalComment = null;
  if (dispatch.action === "approve") {
    try {
      proposalComment = await gh.getDiscussionComment(dispatch.proposalId);
    } catch (error) {
      return failAndExit(`Falha ao ler a proposta no GitHub Discussions: ${error.message}`);
    }
  }

  const outcome = validateCuration({
    payload: dispatch,
    reputation,
    snapshot,
    proposalComment,
    now: new Date().toISOString(),
  });
  if (!outcome.ok) {
    return failAndExit(`${outcome.code}: ${outcome.message}`, outcome.errors);
  }
  if (outcome.noop) {
    okSummary(outcome);
    console.log(JSON.stringify({ status: "noop", code: outcome.code, ...dispatch }));
    return;
  }

  document[dispatch.questionId] = outcome.snapshot;
  const nextContent = `${JSON.stringify(document, null, 2)}\n`;
  const headline = `curadoria: ${dispatch.action === "approve" ? "aprovar" : "restaurar"} ${dispatch.questionId} v${outcome.revision.version}`;
  let commit;
  try {
    commit = await gh.commitFile({
      path: `discussao/${dispatch.prefix}.json`,
      content: nextContent,
      branch: "main",
      headline: headline.slice(0, 72),
      body: [
        `Curadoria automática da Camada de Mielina (Fase 4).`,
        ``,
        `- Ação: ${dispatch.action}`,
        `- Questão: ${dispatch.questionId}`,
        `- Versão publicada: v${outcome.revision.version}`,
        `- Aprovador: ${dispatch.approverHandle || dispatch.approverId} (tier ${outcome.revision.approverTier})`,
        `- contentHash: ${outcome.revision.contentHash}`,
        dispatch.proposalId ? `- originCommentId: ${dispatch.proposalId}` : "",
        dispatch.action === "revert" ? `- Restaurada da: v${dispatch.targetVersion}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (error) {
    return failAndExit(`Falha ao commitar em main: ${error.message}`);
  }
  okSummary(outcome);
  console.log(
    JSON.stringify({
      status: "applied",
      code: outcome.code,
      questionId: dispatch.questionId,
      version: outcome.revision.version,
      commit: commit && commit.oid ? commit.oid : "",
      commitUrl: commit && commit.url ? commit.url : "",
    })
  );
}

function failAndExit(message, details = []) {
  failSummary(message, details);
  process.exitCode = 1;
}

function runValidate(file) {
  if (!file) {
    console.error("Uso: node scripts/curadoria-sintese.mjs --validate-dispatch ARQUIVO.json");
    process.exitCode = 2;
    return;
  }
  const data = JSON.parse(readFileSync(file, "utf8"));
  const payload = data && data.client_payload ? data.client_payload : data;
  const validated = validateDispatchPayload(payload);
  if (!validated.ok) {
    console.error(JSON.stringify({ ok: false, errors: validated.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, value: validated.value }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) {
    await runApply();
    return;
  }
  const validateIndex = args.indexOf("--validate-dispatch");
  if (validateIndex !== -1) {
    runValidate(args[validateIndex + 1]);
    return;
  }
  console.log(
    [
      "curadoria-sintese — validação da curadoria da Síntese Wiki (Camada de Mielina v2)",
      "",
      "  node scripts/curadoria-sintese.mjs --apply",
      "      workflow: relê main, revalida gates e commita a nova revisão (assinada via API).",
      "  node scripts/curadoria-sintese.mjs --validate-dispatch ARQUIVO.json",
      "      valida localmente o client_payload de um repository_dispatch.",
    ].join("\n")
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    failSummary("Erro inesperado na curadoria.", [String(error && error.message)]);
    process.exitCode = 1;
  });
}
