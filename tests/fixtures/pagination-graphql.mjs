/**
 * Fixture determinística do GraphQL do GitHub Discussions para testar a
 * paginação profunda do sync (scripts/sync-discussao.mjs) SEM rede.
 *
 * Cenário "gravado" (formatos equivalentes a Q_DISCUSSIONS/Q_COMMENTS/
 * Q_REPLIES/Q_REACTIONS):
 *  - 1 discussão D_1, título público RAN-AZ900-00001;
 *  - 60 comentários: 50 na primeira página (Q_DISCUSSIONS) e 10 na segunda
 *    (Q_COMMENTS);
 *  - comentário DC_1 com 55 respostas: `replies { totalCount }` = 55 e as
 *    respostas vêm paginadas por Q_REPLIES (50 + 5), do cursor nulo; cada
 *    resposta tem 2 reações humanas;
 *  - reações da discussão: 120 apoiantes humanos únicos (>100 → 2 páginas),
 *    mais 1 reação de Bot e 1 auto-reação do autor, ambas na 2ª página, que
 *    NÃO podem contar como apoio;
 *  - reações do comentário DC_1: 120 (>100 → 2 páginas).
 *
 * O fake é fiel à SELEÇÃO PEDIDA no documento GraphQL, como o GitHub:
 *  - `replies` de um comentário só aparece quando a query seleciona
 *    `replies { totalCount }`; sem a seleção o campo vem ausente (é o bug
 *    silencioso que estes testes precisam capturar);
 *  - inlinar `replies(first:...)` dentro de comments devolve erro
 *    MAX_NODE_LIMIT_EXCEEDED — o custo 50×50×50×100 estoura o limite real de
 *    500.000 nós do GitHub (foi assim que a 1ª versão do fix foi rejeitada).
 *
 * Os documentos enviados ficam em `stats.queries` (por tipo) para asserção de
 * contrato. As respostas têm a forma { ok: true, json: async () => ({ data }) },
 * igual ao shape mínimo consumido por gql() em scripts/sync-discussao.mjs.
 */

export const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
export const REPO_URL = "https://github.com/ironidesflj/noos-hub";

export const QUESTION_ID = "RAN-AZ900-00001";
export const DISCUSSION_ID = "D_1";
export const FIRST_COMMENT_ID = "DC_1";
export const FIRST_REPLY_AUTHOR_ID = "U_reply_author";

export const TOTAL_COMMENTS = 60;
export const TOTAL_REPLIES = 55;
export const DISCUSSION_REAL_SUPPORTERS = 120;
export const DISCUSSION_EXTRA_REACTIONS = 2; // 1 Bot + 1 auto-apoio (não contam)
export const COMMENT_REACTIONS = 120;
export const REPLIES_PER_REPLY = 2;
export const EXPECTED_REPLY_ACCELERATIONS = TOTAL_REPLIES * REPLIES_PER_REPLY; // 110
export const EXPECTED_OFFICIAL_REPLY_POSTS = 3;

export const COMMENT_PAGE_SIZE = 50;
export const REPLY_PAGE_SIZE = 50;
export const REACTION_PAGE_SIZE = 100;

const COMMENTS_PAGE_2_CURSOR = "cursor:comments:1";
const REPLIES_PAGE_2_CURSOR = "cursor:replies:1";
const reactionPage2Cursor = (subjectId) => `cursor:reactions:${subjectId}:1`;

const BASE_MS = Date.UTC(2026, 10, 10, 0, 0, 0); // 2026-11-10T00:00:00Z
const iso = (minutes) => new Date(BASE_MS + minutes * 60_000).toISOString();
const discussionUrl = `${REPO_URL}/discussions/1`;
const commentUrl = (suffix) => `${discussionUrl}#${suffix}`;

const USER = (login, id, databaseId) => ({ __typename: "User", login, id, databaseId });
const BOT = { __typename: "Bot", login: "noos-bot[bot]", id: "B_noos_bot", databaseId: 999 };

const SUPPORT_CONTENTS = ["ROCKET", "THUMBS_UP", "HEART"];
const reaction = (index, user) => ({ content: SUPPORT_CONTENTS[index % SUPPORT_CONTENTS.length], user });
const connection = (nodes, hasNextPage = false, endCursor = null) => ({
  pageInfo: { hasNextPage, endCursor },
  nodes,
});

// ---------- dados canônicos ----------

const discussionAuthor = USER("autor-noos", "U_author", 1000);
const replyAuthor = USER("reply-user", FIRST_REPLY_AUTHOR_ID, 2001);
const replyFanA = USER("reply-fan-a", "U_replyfan_a", 3001);
const replyFanB = USER("reply-fan-b", "U_replyfan_b", 3002);

const discussionFans = Array.from({ length: DISCUSSION_REAL_SUPPORTERS }, (_, i) =>
  USER(`disc-fan-${i + 1}`, `U_discfan_${i + 1}`, 10_000 + i)
);
const commentFans = Array.from({ length: COMMENT_REACTIONS }, (_, i) =>
  USER(`cmt-fan-${i + 1}`, `U_cmtfan_${i + 1}`, 20_000 + i)
);

/** 120 apoios reais, depois Bot e auto-apoio (ficam na 2ª página). */
const discussionReactions = [
  ...discussionFans.map((fan, i) => reaction(i, fan)),
  reaction(0, BOT),
  reaction(1, discussionAuthor),
];

/** 120 apoios reais no comentário DC_1. */
const commentReactions = commentFans.map((fan, i) => reaction(i, fan));

/**
 * 55 respostas do DC_1. IDs seguem o formato real do GitHub: respostas são
 * DiscussionComment, logo o node id começa com "DC_" (nunca "DR_").
 */
function buildReplies() {
  return Array.from({ length: TOTAL_REPLIES }, (_, idx) => {
    const n = idx + 1;
    const body =
      n <= EXPECTED_OFFICIAL_REPLY_POSTS
        ? `**O que a documentação oficial não conta de primeira:**\nRéplica ${n} com fonte oficial.\n\n**Fonte oficial:** https://learn.microsoft.com/azure/`
        : `Réplica ${n}: concordo com a explicação da alternativa apontada.`;
    return {
      id: `DC_r${n}`,
      url: commentUrl(`discussioncomment-r${n}`),
      createdAt: iso(180 + n),
      updatedAt: iso(180 + n),
      author: replyAuthor,
      body,
      reactions: connection([reaction(0, replyFanA), reaction(1, replyFanB)]),
    };
  });
}

/** Só DC_1 tem respostas; os demais comentários têm totalCount 0. */
function replyCountFor(commentId) {
  return commentId === FIRST_COMMENT_ID ? TOTAL_REPLIES : 0;
}

function buildComments() {
  return Array.from({ length: TOTAL_COMMENTS }, (_, idx) => {
    const n = idx + 1;
    const id = `DC_${n}`;
    return {
      id,
      url: commentUrl(`discussioncomment-${n}`),
      createdAt: iso(60 + n),
      updatedAt: iso(60 + n),
      isAnswer: false,
      author: USER(`commenter-${n}`, `U_commenter_${n}`, 5000 + n),
      body: `**Alternativa que confundiu:** ${["A", "B", "C", "D"][n % 4]}\n\n**O que a documentação oficial não conta de primeira:**\nComentário ${n} explicando a pegadinha da questão.`,
      reactions:
        id === FIRST_COMMENT_ID
          ? connection(
              commentReactions.slice(0, REACTION_PAGE_SIZE),
              true,
              reactionPage2Cursor(FIRST_COMMENT_ID)
            )
          : connection([]),
      replies: { totalCount: replyCountFor(id) },
    };
  });
}

function buildDiscussion(comments) {
  return {
    id: DISCUSSION_ID,
    number: 1,
    url: discussionUrl,
    title: QUESTION_ID,
    createdAt: iso(0),
    updatedAt: iso(0),
    author: discussionAuthor,
    body: "**Status:** Passei na prova!\n\nExplicação raiz da questão, sem bloco de proposta.",
    reactions: connection(
      discussionReactions.slice(0, REACTION_PAGE_SIZE),
      true,
      reactionPage2Cursor(DISCUSSION_ID)
    ),
    comments: connection(comments.slice(0, COMMENT_PAGE_SIZE), true, COMMENTS_PAGE_2_CURSOR),
  };
}

// ---------- fidelidade ao contrato GraphQL ----------

/**
 * Seleção inline de replies dentro de comments: exatamente o padrão rejeitado
 * pelo GitHub com MAX_NODE_LIMIT_EXCEEDED (50 discussions × 50 comments ×
 * 50 replies × 100 reactions). Q_REPLIES usa `replies(first:50, after:$cursor)`,
 * que NÃO casa com este padrão.
 */
const INLINE_REPLIES_PATTERN = /replies\(first:\d+\)\s*\{/;

/** O GitHub só devolve `replies` do comentário se a seleção estiver na query. */
function applyReplySelection(nodes, query) {
  const wantsTotalCount = /replies\s*\{\s*totalCount\s*\}/.test(String(query));
  if (wantsTotalCount) return nodes;
  return nodes.map((node) => {
    const clone = { ...node };
    delete clone.replies;
    return clone;
  });
}

// ---------- classificação das queries (espelha scripts/sync-discussao.mjs) ----------

function classifyQuery(query) {
  const q = String(query || "");
  if (q.includes("repository(owner:$owner")) return "discussions";
  if (q.includes("replies(first:50, after:$cursor)")) return "replies";
  if (q.includes("comments(first:50, after:$cursor)")) return "comments";
  if (q.includes("reactions(first:100, after:$cursor)")) return "reactions";
  return "unknown";
}

// ---------- servidor fake ----------

/**
 * Cria o servidor GraphQL determinístico.
 * @returns {{
 *   fetch: (url: string, options?: {body?: string}) => Promise<{ok: boolean, json: () => Promise<{data?: any, errors?: any[]}>}>,
 *   stats: {calls: object, pages: object, queries: object, rejected: number},
 * }}
 */
export function createPaginationServer() {
  const replies = buildReplies();
  const comments = buildComments();
  const discussion = buildDiscussion(comments);

  const stats = {
    // chamadas HTTP por tipo de query
    calls: { discussions: 0, comments: 0, replies: 0, reactions: 0, unknown: 0 },
    // páginas distintas materializadas por conexão paginada
    pages: { comments: 0, replies: 0, reactions: 0 },
    // documentos GraphQL recebidos, por tipo de query (contrato de seleção)
    queries: { discussions: [], comments: [], replies: [], reactions: [] },
    // queries recusadas pelo limite de nós do GitHub
    rejected: 0,
  };
  const pagesSeen = new Set();
  const registerPage = (kind, key) => {
    const pageId = `${kind}:${key}`;
    if (pagesSeen.has(pageId)) return;
    pagesSeen.add(pageId);
    stats.pages[kind] += 1;
  };

  function graphqlError(type, message) {
    return { ok: true, json: async () => ({ data: null, errors: [{ type, message }] }) };
  }

  function servedCommentNodes(nodes, query) {
    return structuredClone(applyReplySelection(nodes, query));
  }

  function commentsPage(cursor, query) {
    if (cursor === null || cursor === undefined) {
      registerPage("comments", "1");
      return connection(servedCommentNodes(comments.slice(0, COMMENT_PAGE_SIZE), query), true, COMMENTS_PAGE_2_CURSOR);
    }
    if (cursor === COMMENTS_PAGE_2_CURSOR) {
      registerPage("comments", "2");
      return connection(servedCommentNodes(comments.slice(COMMENT_PAGE_SIZE), query), false, null);
    }
    throw new Error(`fixture pagination: cursor de comentários desconhecido: ${cursor}`);
  }

  function repliesPage(cursor) {
    if (cursor === null || cursor === undefined) {
      registerPage("replies", "1");
      return connection(structuredClone(replies.slice(0, REPLY_PAGE_SIZE)), true, REPLIES_PAGE_2_CURSOR);
    }
    if (cursor === REPLIES_PAGE_2_CURSOR) {
      registerPage("replies", "2");
      return connection(structuredClone(replies.slice(REPLY_PAGE_SIZE)), false, null);
    }
    throw new Error(`fixture pagination: cursor de respostas desconhecido: ${cursor}`);
  }

  function reactionsPage(subjectId, cursor) {
    const nodes =
      subjectId === DISCUSSION_ID
        ? discussionReactions
        : subjectId === FIRST_COMMENT_ID
          ? commentReactions
          : null;
    if (!nodes) return connection([], false, null);
    if (cursor === null || cursor === undefined) {
      registerPage("reactions", `${subjectId}:1`);
      return connection(
        structuredClone(nodes.slice(0, REACTION_PAGE_SIZE)),
        true,
        reactionPage2Cursor(subjectId)
      );
    }
    if (cursor === reactionPage2Cursor(subjectId)) {
      registerPage("reactions", `${subjectId}:2`);
      return connection(structuredClone(nodes.slice(REACTION_PAGE_SIZE)), false, null);
    }
    throw new Error(`fixture pagination: cursor de reações desconhecido (${subjectId}): ${cursor}`);
  }

  function discussionsResponse(query) {
    registerPage("comments", "1");
    registerPage("reactions", `${DISCUSSION_ID}:1`);
    registerPage("reactions", `${FIRST_COMMENT_ID}:1`);
    const node = {
      ...structuredClone(discussion),
      comments: connection(
        servedCommentNodes(comments.slice(0, COMMENT_PAGE_SIZE), query),
        true,
        COMMENTS_PAGE_2_CURSOR
      ),
    };
    return { repository: { discussions: connection([node], false, null) } };
  }

  async function fetchImpl(url, options = {}) {
    if (String(url) !== GRAPHQL_ENDPOINT) {
      throw new Error(`fixture pagination: endpoint inesperado: ${url}`);
    }
    const payload = options.body ? JSON.parse(String(options.body)) : {};
    const query = String(payload.query || "");
    const variables = payload.variables || {};
    const kind = classifyQuery(query);
    stats.calls[kind] += 1;
    if (Array.isArray(stats.queries[kind])) stats.queries[kind].push(query);

    // Modela o limite de nós do GitHub: replies inline sob comments = 12,5M nós.
    if (INLINE_REPLIES_PATTERN.test(query)) {
      stats.rejected += 1;
      return graphqlError(
        "MAX_NODE_LIMIT_EXCEEDED",
        "By the time this query traverses to the reactions connection, it is requesting up to 12,500,000 possible nodes which exceeds the maximum limit of 500,000."
      );
    }

    let data;
    if (kind === "discussions") {
      data = discussionsResponse(query);
    } else if (kind === "comments") {
      data = { node: { comments: commentsPage(variables.cursor, query) } };
    } else if (kind === "replies") {
      if (variables.id !== FIRST_COMMENT_ID) {
        throw new Error(`fixture pagination: Q_REPLIES para comentário sem respostas: ${variables.id}`);
      }
      data = { node: { replies: repliesPage(variables.cursor) } };
    } else if (kind === "reactions") {
      data = {
        node: {
          __typename: variables.id === DISCUSSION_ID ? "Discussion" : "DiscussionComment",
          reactions: reactionsPage(variables.id, variables.cursor),
        },
      };
    } else {
      throw new Error(`fixture pagination: query não reconhecida: ${query.slice(0, 80)}`);
    }
    return { ok: true, json: async () => ({ data }) };
  }

  return { fetch: fetchImpl, stats };
}
