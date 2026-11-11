import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeProposalBlock } from "./curadoria-sintese.mjs";
import {
  parseQuestionTitle,
  parseStructured,
  groupDiscussions,
  mergeSynthesis,
  buildAuthorMetrics,
  collectContributions,
} from "./sync-discussao.mjs";

test("título público → prefixo/ID", () => {
  assert.deepEqual(parseQuestionTitle("RAN-AZ900-00001"), { prefix: "RAN", id: "RAN-AZ900-00001" });
  assert.equal(parseQuestionTitle("Fórum solto"), null);
});

test("parser estruturado lê alternativa, aprovação e fonte", () => {
  const p = parseStructured(
    "**Alternativa que confundiu:** C\n\n**Status:** ✦ Passei na prova!\n\n**O que a documentação oficial não conta de primeira:**\nA pegadinha está no SLA.\n\n**Fonte oficial:** https://learn.microsoft.com/azure/sla"
  );
  assert.equal(p.option, "C");
  assert.equal(p.passed, true);
  assert.equal(p.sourceUrl, "https://learn.microsoft.com/azure/sla");
  assert.match(p.explanation, /pegadinha/);
});

test("agrupa por título: mais antiga canônica, demais legacy", () => {
  const grouped = groupDiscussions([
    { id: "D2", title: "RAN-AZ900-00001", createdAt: "2026-11-10T12:00:00Z", comments: { nodes: [] } },
    { id: "D1", title: "RAN-AZ900-00001", createdAt: "2026-11-09T12:00:00Z", comments: { nodes: [] } },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].canonical.id, "D1");
  assert.deepEqual(grouped[0].legacy.map((d) => d.id), ["D2"]);
});

test("mergeSynthesis preserva revisões e propostas (sync não é autoridade editorial)", () => {
  const existing = {
    synthesis: { version: 3, body: "atual", revisions: [{ version: 1, body: "antiga" }], pendingProposals: [{ id: "p1" }] },
  };
  const merged = mergeSynthesis(existing);
  assert.deepEqual(merged, existing.synthesis);
  assert.notEqual(merged, existing.synthesis);
});

test("tiers derivados: 1 participante, 2 aprovado, 3 e 4 com E estrito", () => {
  const author = (id) => ({
    authorId: id,
    handle: `@${id}`,
    subjectId: `DC_${id}`,
    accelerations: 0,
    officialPosts: 0,
    sourceOfficial: false,
    passedSelfDeclared: false,
    createdAt: "2026-11-10T00:00:00Z",
  });
  const c1 = { ...author("u1"), subjectId: "DC_1" };
  const c2 = { ...author("u2"), subjectId: "DC_2", passedSelfDeclared: true };
  const c3 = ["DC_3a", "DC_3b", "DC_3c"].map((subjectId) => ({
    ...author("u3"),
    subjectId,
    accelerations: 10,
    sourceOfficial: true,
    sourceUrl: "https://learn.microsoft.com/azure/",
  }));
  const entries = [{ id: "RAN-AZ900-00001", comments: [c1, c2, ...c3] }];
  const authors = buildAuthorMetrics(entries, new Map(), []);
  assert.equal(authors.u1.tier, 1);
  assert.equal(authors.u2.tier, 2);
  assert.equal(authors.u3.tier, 3);
});


test("proposta mielina é extraída separadamente e não vira comentário", () => {
  const proposal = serializeProposalBlock({
    questionId: "RAN-AZ900-00001",
    baseVersion: 2,
    body: "Proposta consolidada com base na fonte oficial vigente.",
    sourceUrl: "https://learn.microsoft.com/azure/",
  });
  const discussion = {
    id: "D_1",
    number: 1,
    url: "https://github.com/ironidesflj/noos-hub/discussions/1",
    title: "RAN-AZ900-00001",
    createdAt: "2026-11-11T00:00:00Z",
    author: { __typename: "User", id: "U_autor", login: "autor" },
    body: "raiz",
    reactions: { nodes: [] },
    comments: {
      nodes: [
        {
          id: "DC_1",
          url: "https://github.com/ironidesflj/noos-hub/discussions/1#discussioncomment-1",
          createdAt: "2026-11-11T10:00:00Z",
          updatedAt: "2026-11-11T10:00:00Z",
          author: { __typename: "User", id: "U_prop", login: "prop" },
          body: proposal,
          reactions: { nodes: [] },
          replies: { nodes: [] },
        },
        {
          id: "DC_2",
          url: "https://github.com/ironidesflj/noos-hub/discussions/1#discussioncomment-2",
          createdAt: "2026-11-11T11:00:00Z",
          updatedAt: "2026-11-11T11:00:00Z",
          author: { __typename: "User", id: "U_hum", login: "hum" },
          body: "**Alternativa que confundiu:** B\n\n**O que a documentação oficial não conta de primeira:**\nExplicação válida com fonte.\n\n**Fonte oficial:** https://learn.microsoft.com/azure/",
          reactions: { nodes: [] },
          replies: { nodes: [] },
        },
      ],
    },
  };
  const group = {
    id: "RAN-AZ900-00001",
    prefix: "RAN",
    canonical: discussion,
    legacy: [],
    discussions: [discussion],
  };
  const out = collectContributions(group, {
    RAN: ["learn.microsoft.com"],
    GLOBAL: [],
  });
  assert.equal(out.comments.length, 2); // raiz + comentário normal
  assert.ok(out.comments.some((c) => c.subjectId === "DC_2"));
  assert.ok(!out.comments.some((c) => c.subjectId === "DC_1"));
  assert.equal(out.proposals.length, 1);
  assert.equal(out.proposals[0].proposalId, "DC_1");
  assert.equal(out.proposals[0].baseVersion, 2);
  assert.match(out.proposals[0].contentHash, /^sha256:[a-f0-9]{64}$/);
});
