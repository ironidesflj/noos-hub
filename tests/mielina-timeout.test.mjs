/**
 * Testes do timeout real das chamadas ao GitHub na Camada de Mielina:
 * cliente GraphQL/REST aborta em 504 `GITHUB_TIMEOUT`, o handler traduz o erro
 * para HTTP 504, o POST de apoio não soma nada localmente e a reconciliação
 * via GET devolve o estado autoritativo do GitHub.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../lib/mielina/session.js";
import { resetRateLimits } from "../lib/mielina/rate-limit.js";
import { GitHubClient, GitHubError } from "../lib/mielina/github.js";
import { translateError } from "../lib/mielina/handler.js";
import { dispatchClientFor, githubFor } from "../lib/mielina/routes-common.js";
import supportRoute from "../api/mielina/support.js";

const SECRET = "segredo-de-teste-timeout-1234567890";
const NOW = new Date("2026-11-11T13:00:00Z");
const Q = "RAN-TBDEA-00001";
const REPO = "ironidesflj/noos-hub";
const ORIGIN = "https://noos.study";
const SESSION_TOKEN = "gho_user_timeout_secreto";
const SERVER_TOKEN = "ghs_servidor_timeout_secreto";
const DISPATCH_TOKEN = "ghs_dispatch_timeout_secreto";
const TIMEOUT_MS = 50;

const ENV = {
  MIELINA_SESSION_SECRET: SECRET,
  MIELINA_GITHUB_TOKEN: SERVER_TOKEN,
  MIELINA_DISPATCH_TOKEN: DISPATCH_TOKEN,
  MIELINA_REPO: REPO,
  MIELINA_BASE_URL: ORIGIN,
  MIELINA_GITHUB_TIMEOUT_MS: String(TIMEOUT_MS),
};

let world;

function abortError() {
  const error = new Error("abortado");
  error.name = "AbortError";
  return error;
}

/** Dublê pendurado que só rejeita quando `options.signal` aborta. */
function hangUntilAbort(signal) {
  return new Promise((resolve, reject) => {
    assert.ok(signal, "fetch com timeout precisa receber options.signal");
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
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

function seedSubjectNode() {
  world.nodes.DC_1 = {
    __typename: "DiscussionComment",
    id: "DC_1",
    url: `https://github.com/${REPO}/discussions/1#discussioncomment-1`,
    createdAt: NOW.toISOString(),
    author: { id: "U_AUTHOR", login: "author" },
    discussion: {
      id: "D_Q",
      number: 1,
      url: `https://github.com/${REPO}/discussions/1`,
      title: Q,
      repository: { nameWithOwner: REPO },
    },
  };
}

function resetWorld(overrides = {}) {
  world = {
    viewerId: "U_VIEWER",
    reactions: [],
    nodes: {},
    mutations: 0,
    reactionReads: 0,
    hangAll: false,
    hangReactionReadAfterMutation: false,
    fetchCalls: 0,
    ...overrides,
  };
  seedSubjectNode();
  return world;
}

/** Fetch fake do GitHub: saudável por padrão; pendura conforme o cenário. */
async function worldFetch(url, options = {}) {
  world.fetchCalls += 1;
  if (world.hangAll) return hangUntilAbort(options.signal);
  const parsed = new URL(url);
  if (parsed.pathname === "/graphql") {
    const body = JSON.parse(options.body || "{}");
    const query = String(body.query || "");
    const variables = body.variables || {};
    if (query.includes("reactions(first")) {
      world.reactionReads += 1;
      // Leitura posterior à mutação pendura: o POST estoura depois de aplicar.
      if (world.hangReactionReadAfterMutation && world.mutations > 0) {
        return hangUntilAbort(options.signal);
      }
      return jsonResponse({
        data: {
          node: {
            __typename: "DiscussionComment",
            reactions: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: world.reactions.slice(),
            },
          },
        },
      });
    }
    if (query.includes("addReaction")) {
      world.mutations += 1;
      const content = variables.content;
      const exists = world.reactions.some(
        (reaction) =>
          reaction.user && String(reaction.user.id) === world.viewerId && reaction.content === content
      );
      if (!exists) {
        world.reactions.push({
          content,
          user: { id: world.viewerId, login: "viewer", __typename: "User" },
        });
      }
      return jsonResponse({ data: { addReaction: { reaction: { content } } } });
    }
    if (query.includes("removeReaction")) {
      world.mutations += 1;
      world.reactions = world.reactions.filter(
        (reaction) =>
          !(
            reaction.user &&
            String(reaction.user.id) === world.viewerId &&
            reaction.content === variables.content
          )
      );
      return jsonResponse({ data: { removeReaction: { reaction: { content: variables.content } } } });
    }
    if (query.includes("node(id")) {
      return jsonResponse({ data: { node: world.nodes[variables.id] || null } });
    }
    return jsonResponse({ data: {} });
  }
  return jsonResponse({ message: "não esperado" }, 404);
}

function deps(envOverrides = {}) {
  return {
    env: { ...ENV, ...envOverrides },
    fetch: (url, options) => worldFetch(url, options),
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
  return res;
}

function makeReq({ method = "GET", url = "/", headers = {}, body = null } = {}) {
  return { method, url, headers, body };
}

function sessionFor() {
  const session = createSession({
    secret: SECRET,
    token: SESSION_TOKEN,
    authorId: "U_VIEWER",
    handle: "@viewer",
    now: NOW,
    ttlS: 3600,
  });
  return { value: session.value, csrf: session.csrf };
}

function authReq(options = {}) {
  const session = options.session || sessionFor();
  const headers = {
    "content-type": "application/json",
    origin: ORIGIN,
    cookie: `mielina_session=${encodeURIComponent(session.value)}`,
    "x-mielina-csrf": session.csrf,
  };
  return {
    session,
    req: makeReq({
      method: options.method || "POST",
      url: options.url || "/api/mielina/support",
      headers,
      body: options.body || {},
    }),
  };
}

const TOKENS = [SESSION_TOKEN, SERVER_TOKEN, DISPATCH_TOKEN];

function assertNoTokenLeak(res) {
  const body = String(res.body || "");
  const headers = JSON.stringify(res.headers || {});
  for (const token of TOKENS) {
    assert.equal(body.includes(token), false, "corpo da resposta não pode conter token");
    assert.equal(headers.includes(token), false, "headers da resposta não podem conter token");
  }
}

function hangingFetch() {
  return (url, options = {}) => hangUntilAbort(options.signal);
}

beforeEach(() => {
  resetRateLimits();
  resetWorld();
});

/* --------------------------------------------------------- cliente GitHub */

test("GitHubClient: graphql/rest/dispatchEvent pendurados abortam em 504 GITHUB_TIMEOUT", async () => {
  const gh = new GitHubClient({
    token: SERVER_TOKEN,
    repo: REPO,
    fetchImpl: hangingFetch(),
    timeoutMs: TIMEOUT_MS,
  });
  const check = (error) => {
    assert.ok(error instanceof GitHubError);
    assert.equal(error.status, 504);
    assert.equal(error.code, "GITHUB_TIMEOUT");
    assert.equal(error.message, "O GitHub não respondeu a tempo.");
    assert.equal(error.message.includes(SERVER_TOKEN), false);
    assert.equal(/https?:\/\//.test(error.message), false, "mensagem sem URL interna");
    return true;
  };
  const started = Date.now();
  await assert.rejects(() => gh.graphql("query { viewer { id } }"), check);
  await assert.rejects(() => gh.rest(`/repos/${REPO}`), check);
  await assert.rejects(() => gh.dispatchEvent("mielina-curadoria", { action: "approve" }), check);
  assert.ok(Date.now() - started < 2000, "timeout deve encerrar a chamada rapidamente");
  assert.equal(gh.timeoutMs, TIMEOUT_MS);
  assert.equal(new GitHubClient({ token: SERVER_TOKEN, repo: REPO }).timeoutMs, 10000);
});

test("GitHubClient: corpo da resposta pendurado também estoura em GITHUB_TIMEOUT", async () => {
  const fetchImpl = (url, options = {}) =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => hangUntilAbort(options.signal),
      text: () => hangUntilAbort(options.signal),
    });
  const gh = new GitHubClient({
    token: SERVER_TOKEN,
    repo: REPO,
    fetchImpl,
    timeoutMs: TIMEOUT_MS,
  });
  const check = (error) => error instanceof GitHubError && error.status === 504 && error.code === "GITHUB_TIMEOUT";
  await assert.rejects(() => gh.graphql("query { viewer { id } }"), check);
  await assert.rejects(() => gh.rest(`/repos/${REPO}`), check);
});

test("GitHubClient: falha de rede imediata continua GITHUB_NETWORK", async () => {
  const gh = new GitHubClient({
    token: SERVER_TOKEN,
    repo: REPO,
    fetchImpl: async () => {
      throw new TypeError("offline");
    },
    timeoutMs: TIMEOUT_MS,
  });
  await assert.rejects(
    () => gh.graphql("query { viewer { id } }"),
    (error) => error instanceof GitHubError && error.status === 502 && error.code === "GITHUB_NETWORK"
  );
});

/* ------------------------------------------------------ erro HTTP e env */

test("translateError: 504 vira HttpError 504 GITHUB_TIMEOUT sem vazar internos", () => {
  const translated = translateError(
    new GitHubError("O GitHub não respondeu a tempo.", { status: 504, code: "GITHUB_TIMEOUT" })
  );
  assert.equal(translated.status, 504);
  assert.equal(translated.code, "GITHUB_TIMEOUT");
  assert.match(translated.message, /não respondeu a tempo/);
  assert.equal(/https?:\/\//.test(translated.message), false);
  assert.equal(translated.message.includes(SESSION_TOKEN), false);
  // 502 genérico permanece GITHUB_UNAVAILABLE (timeout não se confunde).
  assert.equal(translateError(new GitHubError("x", { status: 502 })).code, "GITHUB_UNAVAILABLE");
});

test("routes-common: MIELINA_GITHUB_TIMEOUT_MS chega ao cliente GitHub com default seguro", () => {
  assert.equal(githubFor(deps(), { token: SESSION_TOKEN }).timeoutMs, TIMEOUT_MS);
  assert.equal(dispatchClientFor(deps()).timeoutMs, TIMEOUT_MS);
  assert.equal(githubFor(deps({ MIELINA_GITHUB_TIMEOUT_MS: "" }), { token: SESSION_TOKEN }).timeoutMs, 10000);
  assert.equal(githubFor(deps({ MIELINA_GITHUB_TIMEOUT_MS: "abc" }), { token: SESSION_TOKEN }).timeoutMs, 10000);
  assert.equal(
    githubFor(deps({ MIELINA_GITHUB_TIMEOUT_MS: "999999" }), { token: SESSION_TOKEN }).timeoutMs,
    60000
  );
});

/* ------------------------------------------------- POST /support timeout */

test("POST /support pendurado responde 504 GITHUB_TIMEOUT sem alterar reações", async () => {
  world.hangAll = true; // GitHub inteiro pendurado: nenhuma mutação chega a ser feita
  const { req } = authReq({ body: { subjectId: "DC_1", desiredState: true, questionId: Q } });
  const res = makeRes();
  const started = Date.now();
  await supportRoute(req, res, deps());
  const elapsed = Date.now() - started;

  assert.equal(res.statusCode, 504);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "GITHUB_TIMEOUT");
  assert.match(body.message, /não respondeu a tempo/);
  assert.ok(elapsed < 2000, `POST pendurado terminou em ${elapsed}ms`);
  // Sem soma fantasma: nada foi mutado nem devolvido como contagem.
  assert.equal(world.mutations, 0);
  assert.equal(world.reactions.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "count"), false);
  assertNoTokenLeak(res);
});

test("POST /support com mutação aplicada e leitura pendurada: 504 e GET reconcilia sem duplicar", async () => {
  world.hangReactionReadAfterMutation = true;
  const { req, session } = authReq({
    body: { subjectId: "DC_1", desiredState: true, questionId: Q },
  });
  const res = makeRes();
  await supportRoute(req, res, deps());

  // A mutação chegou ao GitHub dublado antes de a reconsulta pendurar.
  assert.equal(res.statusCode, 504);
  assert.equal(res.json().error, "GITHUB_TIMEOUT");
  assert.equal(world.mutations, 1);
  assert.equal(world.reactions.length, 1);
  assert.equal(world.reactions[0].content, "ROCKET");
  assert.equal(world.reactions[0].user.id, "U_VIEWER");
  assertNoTokenLeak(res);

  // GET de reconciliação saudável: contador autoritativo do GitHub.
  world.hangReactionReadAfterMutation = false;
  const get = authReq({
    session,
    method: "GET",
    url: `/api/mielina/support?subjectId=DC_1&questionId=${Q}`,
  });
  const resGet = makeRes();
  await supportRoute(get.req, resGet, deps());
  assert.equal(resGet.statusCode, 200);
  const reconciled = resGet.json();
  assert.equal(reconciled.count, 1);
  assert.equal(reconciled.viewerSupported, true);
  assertNoTokenLeak(resGet);

  // GET é leitura pura: repetir não duplica reação nem contagem.
  const resAgain = makeRes();
  await supportRoute(get.req, resAgain, deps());
  const again = resAgain.json();
  assert.equal(again.count, 1);
  assert.equal(again.viewerSupported, true);
  assert.equal(world.reactions.length, 1);
  assert.equal(world.mutations, 1);
});
