/**
 * Testes dos handlers /api/mielina/* (offline): fetch do GitHub dublado,
 * sessão real (cookie cifrado) e respostas inspecionadas sem subir servidor.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { createOAuthState, createSession } from "../lib/mielina/session.js";
import { resetDataCache } from "../lib/mielina/data.js";
import { resetRateLimits } from "../lib/mielina/rate-limit.js";
import { unseal } from "../lib/mielina/crypto.js";
import { computeContentHash } from "../scripts/curadoria-sintese.mjs";
import {
  parseCommentBlock,
  parseProposalBlock,
  serializeProposalBlock,
} from "../scripts/curadoria-sintese.mjs";

import { handle as loginHandle } from "../api/mielina/auth/login.js";
import { handle as callbackHandle } from "../api/mielina/auth/callback.js";
import { handle as logoutHandle } from "../api/mielina/auth/logout.js";
import { handle as meHandle } from "../api/mielina/me.js";
import { handle as supportHandle } from "../api/mielina/support.js";
import { handle as commentHandle } from "../api/mielina/comment.js";
import { handle as proposeHandle } from "../api/mielina/synthesis/propose.js";
import { handle as approveHandle } from "../api/mielina/synthesis/approve.js";
import { handle as revertHandle } from "../api/mielina/synthesis/revert.js";

const SECRET = "segredo-de-teste-da-mielina-1234567890";
const NOW = new Date("2026-11-11T13:00:00Z");
const Q = "RAN-DBDEA-00001";
const REPO = "ironidesflj/noos-hub";
const SOURCE = "https://learn.microsoft.com/en-us/azure/";
const ORIGIN = "https://noos.study";

const ENV = {
  MIELINA_SESSION_SECRET: SECRET,
  MIELINA_GITHUB_TOKEN: "ghs_servidor_secreto",
  MIELINA_DISPATCH_TOKEN: "ghs_dispatch_secreto",
  MIELINA_REPO: REPO,
  MIELINA_BASE_URL: ORIGIN,
  MIELINA_GITHUB_CLIENT_ID: "client-id-teste",
  MIELINA_GITHUB_CLIENT_SECRET: "client-secret-teste",
  MIELINA_DISCUSSION_CATEGORY_ID: "CAT_QA",
  MIELINA_ALLOWED_ORIGINS: "",
};

let world;

function resetWorld(overrides = {}) {
  world = {
    repo: REPO,
    viewerId: "U_VIEWER",
    viewerLogin: "viewer",
    discussions: [],
    reactions: [],
    comments: [],
    dispatches: [],
    files: {},
    nodes: {},
    commentSeq: 0,
    fetchCalls: [],
    ...overrides,
  };
  world.fetch = async (url, options = {}) => {
    world.fetchCalls.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "raw.test") {
      const key = (parsed.pathname.split("/main/")[1] || "").replace(/^\/+/, "");
      if (Object.prototype.hasOwnProperty.call(world.files, key)) {
        const value = world.files[key];
        if (value === 404) return textResponse("não encontrado", 404);
        return textResponse(typeof value === "string" ? value : JSON.stringify(value));
      }
      return textResponse("não encontrado", 404);
    }
    if (parsed.hostname === "github.com" && parsed.pathname === "/login/oauth/access_token") {
      if (world.tokenFailure) return jsonResponse({ error: "bad_verification_code" }, 400);
      return jsonResponse({ access_token: "gho_user_secreto", token_type: "bearer", expires_in: 28800 });
    }
    if (parsed.pathname === "/graphql") {
      const body = JSON.parse(options.body);
      return graphqlResponse(body.query, body.variables);
    }
    if (parsed.pathname.endsWith("/dispatches")) {
      world.dispatches.push(JSON.parse(options.body));
      return emptyResponse(204);
    }
    return jsonResponse({ message: "não esperado" }, 404);
  };
  return world;
}

function graphqlResponse(query, variables = {}) {
  if (query.includes("viewer")) {
    return jsonResponse({ data: { viewer: { id: world.viewerId, login: world.viewerLogin } } });
  }
  if (query.includes("createDiscussion")) {
    const discussion = {
      id: "D_NEW",
      number: 9,
      url: `https://github.com/${REPO}/discussions/9`,
      title: variables.input.title,
    };
    world.discussions.push(discussion);
    return jsonResponse({ data: { createDiscussion: { discussion } } });
  }
  if (query.includes("addDiscussionComment")) {
    world.commentSeq += 1;
    const comment = {
      id: `DC_new${world.commentSeq}`,
      url: `https://github.com/${REPO}/discussions/1#discussioncomment-${world.commentSeq}`,
      createdAt: NOW.toISOString(),
      author: { id: world.viewerId, login: world.viewerLogin },
    };
    world.comments.push({
      discussionId: variables.input.discussionId,
      body: variables.input.body,
      authorId: world.viewerId,
    });
    return jsonResponse({ data: { addDiscussionComment: { comment } } });
  }
  if (query.includes("discussions(first")) {
    return jsonResponse({
      data: {
        repository: {
          discussions: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: world.discussions,
          },
        },
      },
    });
  }
  if (query.includes("addReaction")) {
    const exists = world.reactions.some(
      (reaction) =>
        reaction.user &&
        reaction.user.id === world.viewerId &&
        reaction.content === variables.content
    );
    if (!exists) {
      world.reactions.push({
        content: variables.content,
        user: { id: world.viewerId, login: world.viewerLogin, __typename: "User" },
      });
    }
    return jsonResponse({ data: { addReaction: { reaction: { content: variables.content } } } });
  }
  if (query.includes("removeReaction")) {
    world.reactions = world.reactions.filter(
      (reaction) =>
        !(reaction.content === variables.content && reaction.user && reaction.user.id === world.viewerId)
    );
    return jsonResponse({ data: { removeReaction: { reaction: { content: variables.content } } } });
  }
  if (query.includes("reactions(first")) {
    return jsonResponse({
      data: {
        node: {
          __typename: "DiscussionComment",
          reactions: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: world.reactions,
          },
        },
      },
    });
  }
  if (query.includes("node(id: $id)")) {
    return jsonResponse({ data: { node: world.nodes[variables.id] || null } });
  }
  if (query.includes("repository(owner")) {
    return jsonResponse({ data: { repository: { id: "R_REPO", nameWithOwner: REPO } } });
  }
  return jsonResponse({ data: {} });
}

function jsonResponse(data, status = 200) {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => data,
    text: async () => text,
  };
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

function emptyResponse(status = 204) {
  return {
    ok: true,
    status,
    headers: { get: () => null },
    json: async () => null,
    text: async () => "",
  };
}

function deps(envOverrides = {}) {
  return {
    env: { ...ENV, ...envOverrides },
    fetch: world.fetch,
    now: () => NOW,
    rawBase: "https://raw.test",
    logger: { error() {} },
  };
}

function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "", ended: false, headersSent: false };
  res.setHeader = (name, value) => {
    res.headers[String(name).toLowerCase()] = value;
  };
  res.end = (chunk) => {
    if (chunk !== undefined) res.body += String(chunk);
    res.ended = true;
    res.headersSent = true;
  };
  res.json = () => JSON.parse(res.body || "null");
  res.cookieHeaders = () => {
    const value = res.headers["set-cookie"];
    return Array.isArray(value) ? value : value ? [value] : [];
  };
  return res;
}

function makeReq({ method = "GET", url = "/", headers = {}, body = null } = {}) {
  return { method, url, headers, body };
}

function sessionFor({ authorId = "U_VIEWER", handle = "@viewer", token = "gho_user_secreto" } = {}) {
  const session = createSession({
    secret: SECRET,
    token,
    authorId,
    handle,
    now: NOW,
    ttlS: 3600,
  });
  return { value: session.value, csrf: session.csrf, payload: session.payload };
}

function authReq(options = {}) {
  const session = options.session || sessionFor();
  const headers = {
    "content-type": "application/json",
    origin: options.origin === undefined ? ORIGIN : options.origin,
    cookie: `mielina_session=${encodeURIComponent(session.value)}`,
    "x-mielina-csrf": options.csrf === undefined ? session.csrf : options.csrf,
  };
  return {
    req: makeReq({
      method: options.method || "POST",
      url: options.url || "/api/mielina/support",
      headers,
      body: options.body || {},
    }),
    session,
  };
}

async function expectHttpError(promise, code, status) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

beforeEach(() => {
  resetDataCache();
  resetRateLimits();
  resetWorld();
});

/* ----------------------------------------------------------------- login */

test("login redireciona ao GitHub com state + PKCE e cookie HttpOnly", async () => {
  const res = makeRes();
  await loginHandle(
    makeReq({ url: "/api/mielina/auth/login?returnTo=/pt/q/RAN-DBDEA-00001/" }),
    res,
    deps()
  );
  assert.equal(res.statusCode, 302);
  const location = new URL(res.headers.location);
  assert.equal(location.origin, "https://github.com");
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "client-id-teste");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.match(location.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.match(location.searchParams.get("state"), /^[A-Za-z0-9_-]{32}$/);
  assert.equal(location.searchParams.get("redirect_uri"), `${ORIGIN}/api/mielina/auth/callback`);
  const cookie = res.cookieHeaders().join(";");
  assert.match(cookie, /mielina_oauth=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test("login falha fechado sem env", async () => {
  await expectHttpError(
    loginHandle(makeReq({ url: "/api/mielina/auth/login" }), makeRes(), deps({ MIELINA_GITHUB_CLIENT_ID: "" })),
    "ENV_MISSING",
    503
  );
});

/* --------------------------------------------------------------- callback */

test("callback troca o code, cria sessão e redireciona para returnTo", async () => {
  const oauth = createOAuthState({
    secret: SECRET,
    state: "STATE_1",
    verifier: "v".repeat(43),
    returnTo: `/pt/q/${Q}/`,
    now: NOW,
  });
  const res = makeRes();
  await callbackHandle(
    makeReq({
      url: "/api/mielina/auth/callback?code=abc&state=STATE_1",
      headers: { cookie: `mielina_oauth=${encodeURIComponent(oauth.value)}` },
    }),
    res,
    deps()
  );
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, `${ORIGIN}/pt/q/${Q}/`);
  const cookies = res.cookieHeaders().join(";");
  assert.match(cookies, /mielina_session=/);
  const cookieValue = cookies.match(/mielina_session=([^;]+)/)[1];
  const payload = unseal(SECRET, decodeURIComponent(cookieValue));
  assert.equal(payload.token, "gho_user_secreto");
  assert.equal(payload.authorId, "U_VIEWER");
  assert.equal(res.body.includes("gho_"), false, "token nunca vai no corpo");
});

test("callback rejeita state divergente e falha sem vazar token", async () => {
  const oauth = createOAuthState({
    secret: SECRET,
    state: "STATE_1",
    verifier: "v".repeat(43),
    returnTo: "/",
    now: NOW,
  });
  const res = makeRes();
  await callbackHandle(
    makeReq({
      url: "/api/mielina/auth/callback?code=abc&state=OUTRO",
      headers: { cookie: `mielina_oauth=${encodeURIComponent(oauth.value)}` },
    }),
    res,
    deps()
  );
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location, /mielina=erro/);
  assert.match(res.headers.location, /motivo=state/);
  assert.equal(res.cookieHeaders().some((cookie) => /mielina_session=/.test(cookie)), false);
  assert.equal(res.body.includes("gho_"), false);
});

/* ------------------------------------------------------------------- me */

test("GET /me sem sessão responde authenticated:false", async () => {
  const res = makeRes();
  await meHandle(makeReq({ url: "/api/mielina/me" }), res, deps());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authenticated: false, observedAt: NOW.toISOString() });
});

test("GET /me autenticado devolve tier, isCurator e csrf sem vazar token", async () => {
  world.files["discussao/reputation.json"] = {
    curators: [],
    authors: { U_VIEWER: { eligibleSupports: 120, distinctApprovedSyntheses: 3 } },
  };
  const { req, session } = authReq({ method: "GET", url: "/api/mielina/me" });
  const res = makeRes();
  await meHandle(req, res, deps());
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.authorId, "U_VIEWER");
  assert.equal(body.tier, 4);
  assert.equal(body.isCurator, false);
  assert.equal(body.csrfToken, session.csrf);
  assert.equal(res.body.includes("gho_"), false);
});

test("GET /me degrada para tier 1 quando a reputação não está disponível", async () => {
  const { req } = authReq({ method: "GET", url: "/api/mielina/me" });
  const res = makeRes();
  await meHandle(req, res, deps());
  const body = res.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.tier, 1);
  assert.equal(body.degraded, true);
});

/* ---------------------------------------------------------------- support */

function seedSupportWorld() {
  world.nodes.DC_1 = {
    __typename: "DiscussionComment",
    id: "DC_1",
    url: "https://github.com/ironidesflj/noos-hub/discussions/1#discussioncomment-1",
    createdAt: NOW.toISOString(),
    author: { id: "U_AUTHOR", login: "author" },
    discussion: {
      id: "D_Q",
      number: 1,
      url: "https://github.com/ironidesflj/noos-hub/discussions/1",
      title: Q,
      repository: { nameWithOwner: REPO },
    },
  };
  world.reactions = [
    { content: "ROCKET", user: { id: "U_AUTHOR", login: "author", __typename: "User" } },
    { content: "HEART", user: { id: "U_OTHER", login: "other", __typename: "User" } },
    { content: "ROCKET", user: { id: "BOT", login: "bot[bot]", __typename: "Bot" } },
  ];
}

test("POST /support adiciona e remove apoio, deduplicando contas", async () => {
  seedSupportWorld();
  const add = authReq({ body: { subjectId: "DC_1", desiredState: true, questionId: Q } });
  const resAdd = makeRes();
  await supportHandle(add.req, resAdd, deps());
  assert.equal(resAdd.statusCode, 200);
  let body = resAdd.json();
  assert.equal(body.count, 2, "U_OTHER + U_VIEWER; autor e bot não contam");
  assert.equal(body.viewerSupported, true);
  assert.equal(body.subjectId, "DC_1");

  const remove = authReq({
    session: add.session,
    body: { subjectId: "DC_1", desiredState: false, questionId: Q },
  });
  const resRemove = makeRes();
  await supportHandle(remove.req, resRemove, deps());
  body = resRemove.json();
  assert.equal(body.count, 1);
  assert.equal(body.viewerSupported, false);
});

test("GET /support reconcilia o estado real", async () => {
  seedSupportWorld();
  world.reactions.push({ content: "ROCKET", user: { id: "U_VIEWER", login: "viewer", __typename: "User" } });
  const { req } = authReq({ method: "GET", url: "/api/mielina/support?subjectId=DC_1" });
  const res = makeRes();
  await supportHandle(req, res, deps());
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.count, 2);
  assert.equal(body.viewerSupported, true);
  assert.equal(body.questionId, Q);
});

test("support valida Origin/CSRF/sessão e vínculo com a questão", async () => {
  seedSupportWorld();
  const noOrigin = authReq({
    origin: "",
    body: { subjectId: "DC_1", desiredState: true, questionId: Q },
  });
  await expectHttpError(supportHandle(noOrigin.req, makeRes(), deps()), "ORIGIN_REQUIRED", 403);

  const badCsrf = authReq({
    csrf: "errado",
    body: { subjectId: "DC_1", desiredState: true, questionId: Q },
  });
  await expectHttpError(supportHandle(badCsrf.req, makeRes(), deps()), "CSRF_INVALID", 403);

  const noSession = makeReq({
    method: "POST",
    url: "/api/mielina/support",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: { subjectId: "DC_1", desiredState: true, questionId: Q },
  });
  await expectHttpError(supportHandle(noSession, makeRes(), deps()), "UNAUTHENTICATED", 401);

  const mismatch = authReq({
    body: { subjectId: "DC_1", desiredState: true, questionId: "SYN-CTFL-00001" },
  });
  await expectHttpError(supportHandle(mismatch.req, makeRes(), deps()), "SUBJECT_QUESTION_MISMATCH", 400);

  world.nodes.DC_1.discussion.repository.nameWithOwner = "outro/repo";
  const foreign = authReq({ body: { subjectId: "DC_1", desiredState: true, questionId: Q } });
  await expectHttpError(supportHandle(foreign.req, makeRes(), deps()), "SUBJECT_FOREIGN_REPO", 400);
});

/* ---------------------------------------------------------------- comment */

test("POST /comment publica bloco estruturado na discussion canônica", async () => {
  world.files["manifestos/RAN.jsonl"] = `${JSON.stringify({ id: Q })}\n`;
  world.files["discussao/RAN.json"] = {
    [Q]: { discussionId: "D_Q", discussionUrl: "https://github.com/x", synthesis: { version: 3 } },
  };
  const { req } = authReq({
    url: "/api/mielina/comment",
    body: {
      questionId: Q,
      option: "B",
      selfDeclaredPassed: true,
      body: "O enunciado nega o acesso interativo; por isso o Job Cluster resolve.",
      sourceUrl: SOURCE,
    },
  });
  const res = makeRes();
  await commentHandle(req, res, deps());
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.match(body.subjectId, /^DC_new/);
  assert.equal(body.authorId, "U_VIEWER");
  const posted = world.comments[0];
  assert.equal(posted.discussionId, "D_Q");
  const parsed = parseCommentBlock(posted.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.option, "B");
  assert.equal(parsed.value.selfDeclaredPassed, true);
  assert.equal(res.body.includes("gho_"), false);
});

test("POST /comment valida fonte, questão e manifesto", async () => {
  world.files["manifestos/RAN.jsonl"] = `${JSON.stringify({ id: Q })}\n`;
  const invalidSource = authReq({
    url: "/api/mielina/comment",
    body: {
      questionId: Q,
      option: "A",
      selfDeclaredPassed: false,
      body: "Texto válido o suficiente para passar na validação de tamanho.",
      sourceUrl: "http://inseguro.example/x",
    },
  });
  await expectHttpError(commentHandle(invalidSource.req, makeRes(), deps()), "INVALID_PAYLOAD", 400);

  const unknown = authReq({
    url: "/api/mielina/comment",
    body: {
      questionId: "SYN-CTFL-00001",
      option: "A",
      selfDeclaredPassed: false,
      body: "Texto válido o suficiente para passar na validação de tamanho.",
      sourceUrl: "",
    },
  });
  await expectHttpError(commentHandle(unknown.req, makeRes(), deps()), "QUESTION_NOT_FOUND", 404);
});

/* ---------------------------------------------------------------- propose */

function seedProposerWorld({ tier = 3 } = {}) {
  const metrics =
    tier >= 3
      ? { eligibleSupports: 30, officialCitedPosts: 4, authenticatedParticipations: 4 }
      : { eligibleSupports: 2, officialCitedPosts: 0, authenticatedParticipations: 1 };
  world.files["discussao/reputation.json"] = {
    curators: [],
    authors: { U_VIEWER: metrics },
  };
  world.files["manifestos/RAN.jsonl"] = `${JSON.stringify({ id: Q })}\n`;
  world.files["discussao/RAN.json"] = {
    [Q]: {
      discussionId: "D_Q",
      discussionUrl: "https://github.com/ironidesflj/noos-hub/discussions/1",
      synthesis: { version: 3, body: "texto atual", sourceUrl: SOURCE, revisions: [] },
    },
  };
  world.nodes.D_Q = {
    __typename: "Discussion",
    id: "D_Q",
    title: Q,
    url: "https://github.com/ironidesflj/noos-hub/discussions/1",
  };
}

test("POST /propose nível 3 publica proposta com contentHash", async () => {
  seedProposerWorld({ tier: 3 });
  const proposalBody = "Síntese revisada com detalhamento da fonte oficial da Microsoft.";
  const { req } = authReq({
    url: "/api/mielina/synthesis/propose",
    body: { questionId: Q, body: proposalBody, sourceUrl: SOURCE },
  });
  const res = makeRes();
  await proposeHandle(req, res, deps());
  assert.equal(res.statusCode, 201);
  const body = res.json();
  const expected = computeContentHash(3, proposalBody, SOURCE);
  assert.equal(body.contentHash, expected);
  assert.equal(body.baseVersion, 3);
  assert.match(body.proposalId, /^DC_new/);
  const parsed = parseProposalBlock(world.comments[0].body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.contentHash, expected);
});

test("POST /propose exige nível 3 e síntese existente", async () => {
  seedProposerWorld({ tier: 2 });
  const lowTier = authReq({
    url: "/api/mielina/synthesis/propose",
    body: { questionId: Q, body: "Síntese revisada com detalhamento da fonte oficial.", sourceUrl: SOURCE },
  });
  await expectHttpError(proposeHandle(lowTier.req, makeRes(), deps()), "PROPOSER_NOT_TIER3", 403);

  resetDataCache();
  seedProposerWorld({ tier: 3 });
  world.files["discussao/RAN.json"] = { [Q]: { discussionId: "D_Q", comments: [] } };
  const noSynthesis = authReq({
    url: "/api/mielina/synthesis/propose",
    body: { questionId: Q, body: "Síntese revisada com detalhamento da fonte oficial.", sourceUrl: SOURCE },
  });
  await expectHttpError(proposeHandle(noSynthesis.req, makeRes(), deps()), "SYNTHESIS_MISSING", 409);
});

/* ---------------------------------------------------------------- approve */

function seedApproverWorld({ approverId = "U_VIEWER", approverTier = 4 } = {}) {
  const approverMetrics =
    approverTier >= 4
      ? { eligibleSupports: 120, distinctApprovedSyntheses: 4, officialCitedPosts: 5 }
      : { eligibleSupports: 30, officialCitedPosts: 4 };
  world.files["discussao/reputation.json"] = {
    curators: [],
    authors: {
      [approverId]: approverMetrics,
      U_PROP: { eligibleSupports: 30, officialCitedPosts: 4 },
    },
  };
  const proposalBody = "Síntese proposta com fonte oficial consolidada da documentação.";
  const contentHash = computeContentHash(3, proposalBody, SOURCE);
  const proposalMarkdown = serializeProposalBlock({
    questionId: Q,
    baseVersion: 3,
    contentHash,
    sourceUrl: SOURCE,
    body: proposalBody,
  });
  world.files["discussao/RAN.json"] = {
    [Q]: {
      discussionId: "D_Q",
      synthesis: {
        version: 3,
        body: "texto atual",
        sourceUrl: SOURCE,
        contributors: [{ authorId: "U_OLD", handle: "@old" }],
        revisions: [
          {
            version: 3,
            body: "texto atual",
            sourceUrl: SOURCE,
            proposerId: "U_OLD",
            proposerHandle: "@old",
            approverId: "U_OLD",
            approverHandle: "@old",
            contentHash: computeContentHash(3, "texto atual", SOURCE),
            createdAt: "2026-01-01T00:00:00Z",
            originCommentId: "DC_v3",
          },
        ],
        pendingProposals: [],
      },
    },
  };
  world.nodes.DC_PROP = {
    __typename: "DiscussionComment",
    id: "DC_PROP",
    url: "https://github.com/ironidesflj/noos-hub/discussions/1#discussioncomment-9",
    body: proposalMarkdown,
    createdAt: "2026-11-11T12:00:00Z",
    author: { id: "U_PROP", login: "prop" },
    discussion: {
      id: "D_Q",
      number: 1,
      url: "https://github.com/ironidesflj/noos-hub/discussions/1",
      title: Q,
      repository: { nameWithOwner: REPO },
    },
  };
  return { proposalId: "DC_PROP", contentHash, proposalBody, baseVersion: 3 };
}

function approveReqBody(proposal, overrides = {}) {
  return {
    questionId: Q,
    proposalId: proposal.proposalId,
    baseVersion: proposal.baseVersion,
    contentHash: proposal.contentHash,
    ...overrides,
  };
}

test("POST /approve dispara repository_dispatch com payload auditável", async () => {
  const proposal = seedApproverWorld();
  const { req } = authReq({ url: "/api/mielina/synthesis/approve", body: approveReqBody(proposal) });
  const res = makeRes();
  await approveHandle(req, res, deps());
  assert.equal(res.statusCode, 202);
  const body = res.json();
  assert.equal(body.dispatched, true);
  assert.equal(world.dispatches.length, 1);
  const dispatch = world.dispatches[0];
  assert.equal(dispatch.event_type, "mielina-curadoria");
  assert.equal(dispatch.client_payload.action, "approve");
  assert.equal(dispatch.client_payload.questionId, Q);
  assert.equal(dispatch.client_payload.proposalId, "DC_PROP");
  assert.equal(dispatch.client_payload.contentHash, proposal.contentHash);
  assert.equal(dispatch.client_payload.approverId, "U_VIEWER");
  assert.equal(dispatch.client_payload.approverTier, 4);
  assert.equal(res.body.includes("gho_"), false);
  assert.equal(res.body.includes("ghs_"), false);
});

test("POST /approve bloqueia auto-aprovação e tiers insuficientes", async () => {
  const proposal = seedApproverWorld();
  const selfSession = sessionFor({ authorId: "U_PROP", handle: "@prop" });
  world.files["discussao/reputation.json"].authors.U_PROP = {
    eligibleSupports: 200,
    distinctApprovedSyntheses: 5,
    officialCitedPosts: 6,
  };
  resetDataCache();
  const selfApproval = authReq({
    session: selfSession,
    url: "/api/mielina/synthesis/approve",
    body: approveReqBody(proposal),
  });
  await expectHttpError(approveHandle(selfApproval.req, makeRes(), deps()), "SELF_APPROVAL_FORBIDDEN", 403);

  resetDataCache();
  const tier3 = seedApproverWorld({ approverTier: 3 });
  const lowTier = authReq({ url: "/api/mielina/synthesis/approve", body: approveReqBody(tier3) });
  await expectHttpError(approveHandle(lowTier.req, makeRes(), deps()), "APPROVER_NOT_TIER4", 403);
});

test("POST /approve detecta conflito de versão e hash divergente", async () => {
  const proposal = seedApproverWorld();
  const conflict = authReq({
    url: "/api/mielina/synthesis/approve",
    body: approveReqBody(proposal, { baseVersion: 2 }),
  });
  await expectHttpError(approveHandle(conflict.req, makeRes(), deps()), "VERSION_CONFLICT", 409);

  const wrongHash = authReq({
    url: "/api/mielina/synthesis/approve",
    body: approveReqBody(proposal, {
      contentHash: computeContentHash(3, "texto diferente", SOURCE),
    }),
  });
  await expectHttpError(approveHandle(wrongHash.req, makeRes(), deps()), "CONTENT_HASH_MISMATCH", 409);
});

/* ----------------------------------------------------------------- revert */

test("POST /revert dispara dispatch com versão alvo e motivo", async () => {
  const proposal = seedApproverWorld();
  world.files["discussao/RAN.json"] = {
    [Q]: {
      discussionId: "D_Q",
      synthesis: {
        version: 5,
        body: "texto atual v5",
        sourceUrl: SOURCE,
        revisions: [1, 2, 3, 4, 5].map((version) => ({
          version,
          body: `texto v${version}`,
          sourceUrl: SOURCE,
          proposerId: "U_OLD",
          proposerHandle: "@old",
          approverId: "U_OLD",
          approverHandle: "@old",
          contentHash: computeContentHash(version, `texto v${version}`, SOURCE),
          createdAt: "2026-01-01T00:00:00Z",
          originCommentId: `DC_v${version}`,
        })),
        pendingProposals: [],
      },
    },
  };
  const { req } = authReq({
    url: "/api/mielina/synthesis/revert",
    body: {
      questionId: Q,
      baseVersion: 5,
      targetVersion: 2,
      reason: "Restaurando o texto consolidado que a comunidade aprovou.",
    },
  });
  const res = makeRes();
  await revertHandle(req, res, deps());
  assert.equal(res.statusCode, 202);
  assert.equal(world.dispatches.length, 1);
  const dispatch = world.dispatches[0];
  assert.equal(dispatch.client_payload.action, "revert");
  assert.equal(dispatch.client_payload.targetVersion, 2);
  assert.equal(dispatch.client_payload.baseVersion, 5);
  assert.match(dispatch.client_payload.dispatchId, /^dispatch_/);
  assert.equal(res.body.includes("GITHUB_TOKEN"), false);
});

/* ----------------------------------------------------------------- logout */

test("POST /logout limpa cookies com CSRF", async () => {
  const { req } = authReq({ url: "/api/mielina/auth/logout" });
  const res = makeRes();
  await logoutHandle(req, res, deps());
  assert.equal(res.statusCode, 200);
  const cookies = res.cookieHeaders().join(";");
  assert.match(cookies, /mielina_session=;/);
  assert.match(cookies, /Max-Age=0/);
});

test("support rejeita auto-apoio antes de escrever reação no GitHub", async () => {
  seedSupportWorld();
  const before = structuredClone(world.reactions);
  const { req } = authReq({
    session: sessionFor({ authorId: world.nodes.DC_1.author.id }),
    body: { subjectId: "DC_1", desiredState: true, questionId: Q },
  });
  await expectHttpError(supportHandle(req, makeRes(), deps()), "SELF_SUPPORT", 403);
  assert.deepEqual(world.reactions, before);
});
