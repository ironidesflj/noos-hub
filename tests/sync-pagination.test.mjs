/**
 * Regressão do bug silencioso de replies no sync (scripts/sync-discussao.mjs) e
 * do custo GraphQL que estourou MAX_NODE_LIMIT_EXCEEDED no GitHub real.
 *
 * Fluxo offline completo: collectAll() percorre Q_DISCUSSIONS → Q_COMMENTS →
 * Q_REPLIES → Q_REACTIONS com globalThis.fetch stubado pela fixture
 * (tests/fixtures/pagination-graphql.mjs, fiel à seleção pedida em cada query).
 * Se `replies { totalCount }` sumir de COMMENT_FIELDS, as asserções de DADOS
 * falham (55 respostas → 0), não só as de contrato.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUniqueSupporters } from "../build/lib/mielina-policy.mjs";
import {
  buildAuthorMetrics,
  collectAll,
  collectContributions,
  groupDiscussions,
} from "../scripts/sync-discussao.mjs";
import {
  COMMENT_REACTIONS,
  DISCUSSION_EXTRA_REACTIONS,
  DISCUSSION_ID,
  DISCUSSION_REAL_SUPPORTERS,
  EXPECTED_OFFICIAL_REPLY_POSTS,
  EXPECTED_REPLY_ACCELERATIONS,
  FIRST_COMMENT_ID,
  FIRST_REPLY_AUTHOR_ID,
  QUESTION_ID,
  REACTION_PAGE_SIZE,
  TOTAL_COMMENTS,
  TOTAL_REPLIES,
  createPaginationServer,
} from "./fixtures/pagination-graphql.mjs";

const FAKE_TOKEN = "ghp_test_token_pagination";
const ALLOWLIST = { RAN: ["learn.microsoft.com"], GLOBAL: [] };

/** Stub de globalThis.fetch com fixture nova por teste; restaura no finally. */
async function withGraphQLFixture(run) {
  const originalFetch = globalThis.fetch;
  const server = createPaginationServer();
  globalThis.fetch = server.fetch;
  try {
    return await run(server);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function collectFixture(token = FAKE_TOKEN) {
  const discussions = await collectAll(token);
  assert.equal(discussions.length, 1, "fixture serve exatamente 1 discussão");
  return discussions[0];
}

test("collectAll pagina comentários, respostas e reações sem estourar o limite de nós", async () => {
  await withGraphQLFixture(async (server) => {
    const node = await collectFixture();
    assert.equal(node.id, DISCUSSION_ID);
    assert.equal(node.comments.nodes.length, TOTAL_COMMENTS);

    const firstComment = node.comments.nodes.find((c) => c.id === FIRST_COMMENT_ID);
    assert.ok(firstComment, "comentário DC_1 presente");
    // 55 respostas via Q_REPLIES do cursor nulo (sem inline em comments)
    assert.equal(firstComment.replies.nodes.length, TOTAL_REPLIES);
    for (const reply of firstComment.replies.nodes) {
      // GitHub só emite IDs de DiscussionComment ("DC_..."); "DR_" não existe
      assert.match(reply.id, /^DC_/);
    }

    // discussão: 120 apoiantes humanos únicos; Bot e auto-apoio não contam
    assert.equal(
      node.reactions.nodes.length,
      DISCUSSION_REAL_SUPPORTERS + DISCUSSION_EXTRA_REACTIONS
    );
    assert.equal(
      computeUniqueSupporters(node.reactions.nodes, node.author.id).size,
      DISCUSSION_REAL_SUPPORTERS
    );

    // comentário com 120 reações reais (>100: 2 páginas)
    assert.equal(firstComment.reactions.nodes.length, COMMENT_REACTIONS);
    assert.equal(
      computeUniqueSupporters(firstComment.reactions.nodes, firstComment.author.id).size,
      COMMENT_REACTIONS
    );

    // N+1 só onde existem respostas: os outros 59 comentários (totalCount 0)
    // não disparam Q_REPLIES — exatamente 2 páginas (50+5), do cursor nulo.
    assert.deepEqual(server.stats.calls, {
      discussions: 1,
      comments: 2,
      replies: 2,
      reactions: 2,
      unknown: 0,
    });
    assert.deepEqual(server.stats.pages, {
      comments: 2,
      replies: 2,
      reactions: 4,
    });
    assert.equal(server.stats.rejected, 0, "nenhuma query pode exceder o limite de nós");
  });
});

test("contrato GraphQL: comments pedem replies{totalCount}; Q_REPLIES pagina do zero", async () => {
  await withGraphQLFixture(async (server) => {
    await collectFixture();

    // Q_DISCUSSIONS (1) e Q_COMMENTS (2) embutem COMMENT_FIELDS
    assert.equal(server.stats.queries.discussions.length, 1);
    assert.equal(server.stats.queries.comments.length, 2);
    const commentQueries = [...server.stats.queries.discussions, ...server.stats.queries.comments];
    for (const query of commentQueries) {
      assert.match(
        query,
        /replies\s*\{\s*totalCount\s*\}/,
        "comments precisam pedir apenas replies { totalCount }"
      );
      assert.doesNotMatch(
        query,
        /replies\(first:/,
        "replies inline em comments estouram MAX_NODE_LIMIT_EXCEEDED no GitHub real"
      );
    }

    // Q_REPLIES traz REPLY_FIELDS com pageInfo e reactions inline (50×100 nós/pág.)
    assert.equal(server.stats.queries.replies.length, 2);
    for (const query of server.stats.queries.replies) {
      assert.match(query, /replies\(first:50, after:\$cursor\)/);
      assert.match(query, /pageInfo\s*\{/);
      assert.doesNotMatch(query, /comments\(first:/, "Q_REPLIES pagina direto no DiscussionComment");
    }

    // A fixture modela o limite de nós: nada foi recusado.
    assert.equal(server.stats.rejected, 0);
  });
});

test("collectContributions inclui as 55 respostas do DC_1 (116 entradas)", async () => {
  await withGraphQLFixture(async () => {
    const node = await collectFixture();
    const groups = groupDiscussions([node]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, QUESTION_ID);

    const { comments, proposals } = collectContributions(groups[0], ALLOWLIST);
    assert.equal(proposals.length, 0);
    // 1 raiz + 60 comentários + 55 respostas
    assert.equal(comments.length, 1 + TOTAL_COMMENTS + TOTAL_REPLIES);

    const replies = comments.filter((c) => c.replyToSubjectId === FIRST_COMMENT_ID);
    assert.equal(replies.length, TOTAL_REPLIES);
    for (const reply of replies) {
      assert.equal(reply.parentSubjectId, FIRST_COMMENT_ID);
      assert.equal(reply.subjectType, "DiscussionComment");
    }

    // o comentário pai aparece antes das respostas na ordem cronológica
    const parentIndex = comments.findIndex((c) => c.subjectId === FIRST_COMMENT_ID);
    const firstReplyIndex = comments.findIndex(
      (c) => c.replyToSubjectId === FIRST_COMMENT_ID
    );
    assert.ok(parentIndex >= 0 && firstReplyIndex > parentIndex);

    // só raiz + comentários de topo têm replyToSubjectId nulo
    assert.equal(
      comments.filter((c) => c.replyToSubjectId === null).length,
      1 + TOTAL_COMMENTS
    );
    assert.equal(new Set(comments.map((c) => c.subjectId)).size, comments.length);
    const times = comments.map((c) => new Date(c.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));

    const root = comments.find((c) => c.subjectId === DISCUSSION_ID);
    assert.equal(root.isRoot, true);
    assert.equal(root.subjectType, "Discussion");
  });
});

test("buildAuthorMetrics reflete autores que só participaram por resposta", async () => {
  await withGraphQLFixture(async () => {
    const node = await collectFixture();
    const { comments } = collectContributions(groupDiscussions([node])[0], ALLOWLIST);
    const authors = buildAuthorMetrics([{ id: QUESTION_ID, comments }], new Map(), []);

    const replyAuthor = authors[FIRST_REPLY_AUTHOR_ID];
    assert.ok(replyAuthor, "autor de resposta entra em buildAuthorMetrics");
    assert.equal(replyAuthor.metrics.authenticatedParticipations, TOTAL_REPLIES);
    assert.equal(replyAuthor.metrics.eligibleSupports, EXPECTED_REPLY_ACCELERATIONS);
    assert.equal(replyAuthor.metrics.officialCitedPosts, EXPECTED_OFFICIAL_REPLY_POSTS);
    // tier 3 = ≥25 apoios + ≥3 fontes oficiais (só possível via respostas)
    assert.equal(replyAuthor.tier, 3);
  });
});
