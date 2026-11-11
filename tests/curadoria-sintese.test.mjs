/**
 * Testes puros do módulo de curadoria da Síntese Wiki (offline, node:test).
 * Cobrem blocos estruturados, contentHash, validação de payloads, tier e os
 * gates de aprovação/reversão da Fase 4.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeContentHash,
  contentHashPayload,
  findCurator,
  getAuthorTier,
  getSynthesisVersion,
  isValidContentHash,
  normalizeReputation,
  normalizeSourceUrl,
  parseCommentBlock,
  parseProposalBlock,
  parseQuestionPrefix,
  serializeCommentBlock,
  serializeProposalBlock,
  validateApprovePayload,
  validateCommentPayload,
  validateCuration,
  validateDispatchPayload,
  validateProposePayload,
  validateRevertPayload,
  validateSupportPayload,
} from "../scripts/curadoria-sintese.mjs";
import { safeReturnTo } from "../lib/mielina/routes-common.js";

const Q = "RAN-DBDEA-00001";
const Q2 = "SYN-CTFL-00001";
const REPO = "ironidesflj/noos-hub";
const SOURCE = "https://learn.microsoft.com/en-us/azure/";
const NOW = "2026-11-11T13:00:00Z";

function revision(version, body = `corpo da versão ${version}`) {
  return {
    version,
    body,
    sourceUrl: SOURCE,
    proposerId: "U_PROP",
    proposerHandle: "@prop",
    approverId: "U_APPR",
    approverHandle: "@appr",
    contentHash: computeContentHash(version, body, SOURCE),
    createdAt: `2026-01-0${version}T00:00:00Z`,
    originCommentId: `DC_old_${version}`,
  };
}

function snapshotWith(version = 3, overrides = {}) {
  const revisions = [];
  for (let index = 1; index <= version; index += 1) revisions.push(revision(index));
  return {
    discussionId: "D_1",
    discussionUrl: "https://github.com/ironidesflj/noos-hub/discussions/1",
    legacyDiscussionIds: [],
    syncedAt: NOW,
    comments: [],
    synthesis: {
      version,
      body: `corpo da versão ${version}`,
      sourceUrl: SOURCE,
      updatedAt: NOW,
      contributors: [{ authorId: "U_PROP", handle: "@prop" }],
      revisions,
      pendingProposals: [],
      ...overrides,
    },
  };
}

function reputation(authorOverrides = {}) {
  return {
    curators: [{ authorId: "U_CURATOR", handle: "@ironidesflj", role: "maintainer-curator" }],
    authors: {
      U_APPR: {
        eligibleSupports: 120,
        distinctApprovedSyntheses: 4,
        officialCitedPosts: 5,
        authenticatedParticipations: 10,
      },
      U_PROP: {
        eligibleSupports: 30,
        officialCitedPosts: 4,
        authenticatedParticipations: 5,
      },
      U_TIER3: {
        eligibleSupports: 26,
        officialCitedPosts: 3,
        authenticatedParticipations: 2,
      },
      ...authorOverrides,
    },
    verifiedOfficialUrls: [],
  };
}

function makeProposal(overrides = {}) {
  const baseVersion = overrides.baseVersion || 3;
  const body = overrides.body || "Síntese consolidada com fonte oficial da Microsoft.";
  const sourceUrl = overrides.sourceUrl || SOURCE;
  const contentHash = computeContentHash(baseVersion, body, sourceUrl);
  return {
    proposalId: "DC_kwPROP",
    baseVersion,
    body,
    sourceUrl,
    contentHash,
    comment: {
      body: serializeProposalBlock({ questionId: Q, baseVersion, contentHash, sourceUrl, body }),
      authorId: "U_PROP",
      authorHandle: "@prop",
    },
  };
}

function approvePayload(proposal, overrides = {}) {
  return {
    action: "approve",
    repo: REPO,
    questionId: Q,
    proposalId: proposal.proposalId,
    baseVersion: proposal.baseVersion,
    contentHash: proposal.contentHash,
    approverId: "U_APPR",
    approverHandle: "@appr",
    dispatchId: "dispatch_approve_1",
    requestedAt: NOW,
    ...overrides,
  };
}

function revertPayload(snapshot, overrides = {}) {
  return {
    action: "revert",
    repo: REPO,
    questionId: Q,
    baseVersion: snapshot.synthesis.version,
    targetVersion: 2,
    reason: "Revertendo para o texto consolidado da v2.",
    approverId: "U_APPR",
    approverHandle: "@appr",
    dispatchId: "dispatch_revert_1",
    requestedAt: NOW,
    ...overrides,
  };
}

/* --------------------------------------------------------------- básicos */

test("parseQuestionPrefix e contentHash do contrato", () => {
  assert.equal(parseQuestionPrefix(Q), "RAN");
  assert.equal(parseQuestionPrefix("invalido"), "");
  const payload = contentHashPayload(3, "  texto  ", " https://x.test/a ");
  assert.equal(payload, "3\ntexto\nhttps://x.test/a");
  const expected = createHash("sha256").update(payload, "utf8").digest("hex");
  assert.equal(computeContentHash(3, "  texto  ", " https://x.test/a "), `sha256:${expected}`);
  assert.match(computeContentHash(3, "texto", SOURCE), /^sha256:[a-f0-9]{64}$/);
  assert.equal(isValidContentHash(computeContentHash(3, "texto", SOURCE)), true);
  assert.equal(isValidContentHash("sha256:curto"), false);
});

test("normalizeSourceUrl só aceita https sem credenciais", () => {
  assert.deepEqual(normalizeSourceUrl(""), { ok: true, value: "" });
  assert.equal(normalizeSourceUrl("https://learn.microsoft.com/x").ok, true);
  assert.equal(normalizeSourceUrl("http://learn.microsoft.com/x").ok, false);
  assert.equal(normalizeSourceUrl("https://user:pass@learn.microsoft.com/x").ok, false);
  assert.equal(normalizeSourceUrl("javascript:alert(1)").ok, false);
});

test("safeReturnTo limita a caminho same-origin", () => {
  assert.equal(safeReturnTo("/pt/q/RAN-DBDEA-00001/#comment-DC_1"), "/pt/q/RAN-DBDEA-00001/#comment-DC_1");
  assert.equal(safeReturnTo("//evil.example/x"), "/");
  assert.equal(safeReturnTo("https://evil.example/x"), "/");
  assert.equal(safeReturnTo("javascript:alert(1)"), "/");
  assert.equal(safeReturnTo(""), "/");
});

/* ------------------------------------------------------------- blocos */

test("bloco de comentário v2 faz round-trip com e sem fonte", () => {
  const withSource = serializeCommentBlock({
    questionId: Q,
    option: "B",
    selfDeclaredPassed: true,
    sourceUrl: SOURCE,
    body: "A pegadinha está na negativa do enunciado; o Job Cluster resolve.",
  });
  assert.match(withSource, /<!-- mielina:v2 \{/);
  const parsed = parseCommentBlock(withSource);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.questionId, Q);
  assert.equal(parsed.value.option, "B");
  assert.equal(parsed.value.selfDeclaredPassed, true);
  assert.equal(parsed.value.sourceUrl, SOURCE);

  const withoutSource = serializeCommentBlock({
    questionId: Q2,
    option: "Geral",
    selfDeclaredPassed: false,
    sourceUrl: "",
    body: "Comentário geral sem fonte, só com o raciocínio da prova.",
  });
  const parsed2 = parseCommentBlock(withoutSource);
  assert.equal(parsed2.ok, true);
  assert.equal(parsed2.value.sourceUrl, "");
  assert.equal(parsed2.value.selfDeclaredPassed, false);
});

test("bloco de comentário rejeita quebra do comentário HTML", () => {
  assert.throws(
    () =>
      serializeCommentBlock({
        questionId: Q,
        option: "A",
        selfDeclaredPassed: false,
        sourceUrl: "",
        body: "texto com --> dentro do corpo",
      }),
    /não pode conter/
  );
  assert.equal(parseCommentBlock("sem bloco nenhum").ok, false);
  assert.equal(parseCommentBlock("<!-- mielina:v2 {json inválido} -->").ok, false);
});

test("bloco de proposta faz round-trip e detecta edição", () => {
  const proposal = makeProposal();
  const parsed = parseProposalBlock(proposal.comment.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.baseVersion, 3);
  assert.equal(parsed.value.contentHash, proposal.contentHash);
  assert.equal(parsed.value.body, proposal.body);

  // Editar o texto do JSON sem atualizar o contentHash invalida a proposta.
  const tampered = proposal.comment.body.replace(
    JSON.stringify(proposal.body),
    JSON.stringify(`${proposal.body} (editado depois)`)
  );
  const parsedTampered = parseProposalBlock(tampered);
  assert.equal(parsedTampered.ok, false);
  assert.equal(parsedTampered.contentHashMismatch, true);
});

/* ----------------------------------------------------------- payloads */

test("validação dos payloads de entrada da API", () => {
  assert.equal(
    validateSupportPayload({ subjectId: "DC_abc123", desiredState: true, questionId: Q }).ok,
    true
  );
  assert.equal(
    validateSupportPayload({ subjectId: "0", desiredState: "true", questionId: Q }).ok,
    false
  );
  assert.equal(
    validateCommentPayload({
      questionId: Q,
      option: "B",
      selfDeclaredPassed: true,
      body: "Texto suficientemente longo para a contribuição.",
      sourceUrl: SOURCE,
    }).ok,
    true
  );
  assert.equal(
    validateCommentPayload({
      questionId: Q,
      option: "Z",
      selfDeclaredPassed: true,
      body: "curto",
      sourceUrl: "http://inseguro.example",
    }).ok,
    false
  );
  assert.equal(
    validateProposePayload({ questionId: Q, body: "x".repeat(60), sourceUrl: SOURCE }).ok,
    true
  );
  assert.equal(
    validateProposePayload({ questionId: Q, body: "x".repeat(60), sourceUrl: "" }).ok,
    false
  );
  const proposal = makeProposal();
  assert.equal(validateApprovePayload({
    questionId: Q,
    proposalId: proposal.proposalId,
    baseVersion: 3,
    contentHash: proposal.contentHash,
  }).ok, true);
  assert.equal(validateApprovePayload({ questionId: Q, proposalId: "nope", baseVersion: 0, contentHash: "x" }).ok, false);
  assert.equal(validateRevertPayload({ questionId: Q, baseVersion: 5, targetVersion: 2, reason: "restaurar a versão dois" }).ok, true);
  assert.equal(validateRevertPayload({ questionId: Q, baseVersion: 2, targetVersion: 5, reason: "restaurar" }).ok, false);
});

test("validação do payload do repository_dispatch", () => {
  const proposal = makeProposal();
  assert.equal(validateDispatchPayload(approvePayload(proposal)).ok, true);
  assert.equal(validateDispatchPayload(approvePayload(proposal, { action: "outra" })).ok, false);
  assert.equal(validateDispatchPayload(approvePayload(proposal, { repo: "__x" })).ok, false);
  assert.equal(validateDispatchPayload(approvePayload(proposal, { contentHash: "sha256:1" })).ok, false);
  const snapshot = snapshotWith(5);
  assert.equal(validateDispatchPayload(revertPayload(snapshot)).ok, true);
  assert.equal(
    validateDispatchPayload(revertPayload(snapshot, { targetVersion: 9 })).ok,
    false
  );
  assert.equal(
    validateDispatchPayload(revertPayload(snapshot, { reason: "curto" })).ok,
    false
  );
});

/* --------------------------------------------------------- reputação */

test("normaliza reputação e calcula tier com a policy real", () => {
  const rep = normalizeReputation(reputation());
  assert.equal(rep.curators.length, 1);
  assert.equal(findCurator(rep, "U_CURATOR").role, "maintainer-curator");
  assert.equal(getAuthorTier(rep, "U_APPR").tier, 4);
  assert.equal(getAuthorTier(rep, "U_PROP").tier, 3);
  assert.equal(getAuthorTier(rep, "U_DESCONHECIDO").tier, 1);
  assert.equal(getAuthorTier(rep, "U_CURATOR").isCurator, true);
  assert.equal(getAuthorTier({}, "U_QUALQUER").tier, 1);

  // Formato tolerante: curators como objeto e authors ausente.
  const tolerant = normalizeReputation({ curators: { U_CURATOR: { role: "maintainer-curator" } } });
  assert.equal(tolerant.curators[0].authorId, "U_CURATOR");
  assert.equal(getSynthesisVersion(snapshotWith(3)), 3);
  assert.equal(getSynthesisVersion({}), null);
});

/* ---------------------------------------------- gates de aprovação */

test("aprovação aplica revisão append-only, remove pendente e não muta a entrada", () => {
  const snapshot = snapshotWith(3);
  const proposal = makeProposal();
  snapshot.synthesis.pendingProposals = [
    {
      proposalId: proposal.proposalId,
      baseVersion: 3,
      proposerId: "U_PROP",
      proposerHandle: "@prop",
      contentHash: proposal.contentHash,
      createdAt: NOW,
    },
  ];
  const original = JSON.parse(JSON.stringify(snapshot));
  const outcome = validateCuration({
    payload: approvePayload(proposal),
    reputation: reputation(),
    snapshot,
    proposalComment: proposal.comment,
    now: NOW,
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.noop, false);
  assert.equal(outcome.code, "APPROVED");
  assert.equal(outcome.revision.version, 4);
  assert.equal(outcome.revision.originCommentId, proposal.proposalId);
  assert.equal(outcome.revision.contentHash, proposal.contentHash);
  assert.equal(outcome.snapshot.synthesis.version, 4);
  assert.equal(outcome.snapshot.synthesis.revisions.length, 4);
  assert.equal(outcome.snapshot.synthesis.revisions[3].body, proposal.body);
  assert.equal(outcome.snapshot.synthesis.pendingProposals.length, 0);
  assert.equal(outcome.snapshot.synthesis.contributors.length, 1);
  assert.equal(outcome.snapshot.synthesis.contributors[0].authorId, "U_PROP");
  // Pureza: a entrada original ficou intacta.
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), original);
});

test("aprovação bloqueia aprovação da própria proposta", () => {
  const proposal = makeProposal();
  const outcome = validateCuration({
    payload: approvePayload(proposal, { approverId: "U_PROP", approverHandle: "@prop" }),
    reputation: reputation({ U_PROP: { eligibleSupports: 200, distinctApprovedSyntheses: 5 } }),
    snapshot: snapshotWith(3),
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 403);
  assert.equal(outcome.code, "SELF_APPROVAL_FORBIDDEN");
});

test("aprovação exige aprovador nível 4 e proponente nível 3", () => {
  const proposal = makeProposal();
  const notTier4 = validateCuration({
    payload: approvePayload(proposal, { approverId: "U_TIER3" }),
    reputation: reputation(),
    snapshot: snapshotWith(3),
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(notTier4.status, 403);
  assert.equal(notTier4.code, "APPROVER_NOT_TIER4");

  const notTier3 = validateCuration({
    payload: approvePayload(proposal),
    reputation: reputation({ U_PROP: { eligibleSupports: 0, officialCitedPosts: 0 } }),
    snapshot: snapshotWith(3),
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(notTier3.status, 403);
  assert.equal(notTier3.code, "PROPOSER_NOT_TIER3");
});

test("aprovação detecta conflito de versão, hash e proposta editada", () => {
  const proposal = makeProposal();
  const versionConflict = validateCuration({
    payload: approvePayload(proposal, { baseVersion: 2 }),
    reputation: reputation(),
    snapshot: snapshotWith(3),
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(versionConflict.status, 409);
  assert.equal(versionConflict.code, "VERSION_CONFLICT");

  const hashMismatch = validateCuration({
    payload: approvePayload(proposal, { contentHash: computeContentHash(3, "outro texto", SOURCE) }),
    reputation: reputation(),
    snapshot: snapshotWith(3),
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(hashMismatch.status, 409);
  assert.equal(hashMismatch.code, "CONTENT_HASH_MISMATCH");

  const tampered = {
    ...proposal.comment,
    body: proposal.comment.body.replace(proposal.body, `${proposal.body} (editado)`),
  };
  const edited = validateCuration({
    payload: approvePayload(proposal),
    reputation: reputation(),
    snapshot: snapshotWith(3),
    proposalComment: tampered,
    now: NOW,
  });
  assert.equal(edited.status, 409);
  assert.equal(edited.code, "PROPOSAL_INVALID");

  const missingComment = validateCuration({
    payload: approvePayload(proposal),
    reputation: reputation(),
    snapshot: snapshotWith(3),
    proposalComment: null,
    now: NOW,
  });
  assert.equal(missingComment.status, 409);
  assert.equal(missingComment.code, "PROPOSAL_UNAVAILABLE");
});

test("aprovação é idempotente por originCommentId", () => {
  const snapshot = snapshotWith(4);
  snapshot.synthesis.revisions[3].originCommentId = "DC_kwPROP";
  const outcome = validateCuration({
    payload: approvePayload(makeProposal(), { baseVersion: 4 }),
    reputation: reputation(),
    snapshot,
    proposalComment: null,
    now: NOW,
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.noop, true);
  assert.equal(outcome.code, "ALREADY_APPLIED");
});

test("proposta pendente armazenada precisa bater com o comentário", () => {
  const proposal = makeProposal();
  const snapshot = snapshotWith(3);
  snapshot.synthesis.pendingProposals = [
    {
      proposalId: proposal.proposalId,
      baseVersion: 3,
      proposerId: "U_PROP",
      contentHash: computeContentHash(3, "divergente", SOURCE),
    },
  ];
  const outcome = validateCuration({
    payload: approvePayload(proposal),
    reputation: reputation(),
    snapshot,
    proposalComment: proposal.comment,
    now: NOW,
  });
  assert.equal(outcome.status, 409);
  assert.equal(outcome.code, "PROPOSAL_STATE_MISMATCH");
});

/* ------------------------------------------------ gates de reversão */

test("reversão cria v(N+1) preservando o histórico", () => {
  const snapshot = snapshotWith(5);
  const original = JSON.parse(JSON.stringify(snapshot));
  const outcome = validateCuration({
    payload: revertPayload(snapshot),
    reputation: reputation(),
    snapshot,
    now: NOW,
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "REVERTED");
  assert.equal(outcome.revision.version, 6);
  assert.equal(outcome.revision.restoredFrom, 2);
  assert.equal(outcome.revision.body, snapshot.synthesis.revisions[1].body);
  assert.equal(outcome.snapshot.synthesis.version, 6);
  assert.equal(outcome.snapshot.synthesis.revisions.length, 6);
  assert.deepEqual(
    outcome.snapshot.synthesis.revisions.slice(0, 5),
    original.synthesis.revisions
  );
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), original);
});

test("reversão: versão alvo ausente, conflito e replay idempotente", () => {
  const snapshot = snapshotWith(5);
  const missing = validateCuration({
    payload: revertPayload(snapshot, { targetVersion: 4, baseVersion: 5 }),
    reputation: reputation(),
    snapshot: snapshotWith(5, { revisions: [revision(1), revision(2)] }),
    now: NOW,
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.code, "TARGET_VERSION_NOT_FOUND");

  const notOlder = validateCuration({
    payload: revertPayload(snapshot, { targetVersion: 5, baseVersion: 5 }),
    reputation: reputation(),
    snapshot,
    now: NOW,
  });
  assert.equal(notOlder.status, 422);

  const replayed = snapshotWith(6);
  replayed.synthesis.revisions[5].dispatchId = "dispatch_revert_1";
  const replay = validateCuration({
    payload: revertPayload(replayed, { baseVersion: 6 }),
    reputation: reputation(),
    snapshot: replayed,
    now: NOW,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.noop, true);
});

test("payload inválido e snapshot ausente falham fechado", () => {
  const invalid = validateCuration({
    payload: { action: "approve" },
    reputation: reputation(),
    snapshot: snapshotWith(3),
    now: NOW,
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.code, "INVALID_PAYLOAD");

  const noSnapshot = validateCuration({
    payload: approvePayload(makeProposal()),
    reputation: reputation(),
    snapshot: null,
    now: NOW,
  });
  assert.equal(noSnapshot.status, 404);
  assert.equal(noSnapshot.code, "SNAPSHOT_NOT_FOUND");
});

/* ------------------------------------------------------------- CLI */

const CLI = fileURLToPath(new URL("../scripts/curadoria-sintese.mjs", import.meta.url));

test("CLI --validate-dispatch valida o payload do dispatch", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mielina-cli-"));
  const good = path.join(dir, "good.json");
  writeFileSync(
    good,
    JSON.stringify({
      action: "approve",
      repo: REPO,
      questionId: Q,
      proposalId: "DC_kwPROP",
      baseVersion: 3,
      contentHash: computeContentHash(3, "texto", SOURCE),
      approverId: "U_APPR",
    })
  );
  const ok = spawnSync(process.execPath, [CLI, "--validate-dispatch", good], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).ok, true);

  const bad = path.join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ action: "explodir" }));
  const nok = spawnSync(process.execPath, [CLI, "--validate-dispatch", bad], { encoding: "utf8" });
  assert.equal(nok.status, 1);
  assert.equal(JSON.parse(nok.stderr).ok, false);
});

test("CLI --apply falha fechado sem token/evento", () => {
  const run = spawnSync(process.execPath, [CLI, "--apply"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_TOKEN: "", MIELINA_GITHUB_TOKEN: "", GITHUB_EVENT_PATH: "" },
  });
  assert.equal(run.status, 1);
  assert.match(`${run.stdout}${run.stderr}`, /GITHUB_TOKEN/);
});
