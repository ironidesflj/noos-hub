/**
 * Testes das bibliotecas da Mielina (offline): cripto/PKCE, cookies de sessão,
 * validação de Origin/CSRF, leitura de JSON, rate limit, dados de main (fetch
 * dublado) e cliente GraphQL/REST do GitHub (fetch dublado).
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  createPkcePair,
  deriveKey,
  randomToken,
  safeEqual,
  seal,
  sha256Base64url,
  unseal,
} from "../lib/mielina/crypto.js";
import {
  createOAuthState,
  createSession,
  oauthSetCookie,
  parseCookies,
  readOAuthState,
  readSession,
  serializeCookie,
  sessionSetCookie,
  SESSION_COOKIE,
} from "../lib/mielina/session.js";
import {
  assertAllowedOrigin,
  assertCsrf,
  allowedOrigins,
  clientIp,
  guardRateLimit,
  HttpError,
  readJsonBody,
  requireEnv,
  requireMethod,
} from "../lib/mielina/http.js";
import { rateLimit, resetRateLimits } from "../lib/mielina/rate-limit.js";
import {
  loadManifestQuestion,
  loadReputation,
  loadSnapshot,
  resetDataCache,
} from "../lib/mielina/data.js";
import { GitHubClient, GitHubError } from "../lib/mielina/github.js";
import { translateError } from "../lib/mielina/handler.js";

const SECRET = "segredo-de-teste-com-32-caracteres!!";
const NOW = new Date("2026-11-11T13:00:00Z");
const ENV = {
  MIELINA_BASE_URL: "https://noos.study",
  MIELINA_ALLOWED_ORIGINS: "http://localhost:3000",
};

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

function makeReq(overrides = {}) {
  return {
    method: "POST",
    url: "/api/mielina/test",
    headers: {},
    body: {},
    ...overrides,
  };
}

function depsWith(fetchImpl, env = ENV, now = () => NOW) {
  return { env, fetch: fetchImpl, now, rawBase: "https://raw.test", logger: { error() {} } };
}

beforeEach(() => {
  resetRateLimits();
  resetDataCache();
});

/* --------------------------------------------------------------- cripto */

test("PKCE S256 e tokens aleatórios", () => {
  const pair = createPkcePair();
  assert.equal(pair.verifier.length, 43);
  assert.equal(pair.challenge, sha256Base64url(pair.verifier));
  assert.match(pair.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(randomToken(16), randomToken(16));
  assert.throws(() => deriveKey("curto"), /mínimo 16/);
});

test("seal/unseal AES-256-GCM detecta adulteração e segredo errado", () => {
  const token = seal(SECRET, { authorId: "U1", token: "gho_x" });
  assert.match(token, /^v1\./);
  assert.deepEqual(unseal(SECRET, token), { authorId: "U1", token: "gho_x" });
  assert.throws(() => unseal("outro-segredo-suficientemente-longo", token), /inválido/);
  const tampered = `${token.slice(0, -2)}xx`;
  assert.throws(() => unseal(SECRET, tampered), /inválido/);
  assert.throws(() => unseal(SECRET, "lixo"), /inválido/);
});

test("safeEqual compara hashes constantes", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("", ""), true);
});

/* -------------------------------------------------------------- cookies */

test("serializeCookie aplica HttpOnly/Secure/SameSite/Lax e parseCookies decodifica", () => {
  const cookie = serializeCookie("mielina_session", "a.b.c", { maxAge: 60, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=60/);
  assert.match(cookie, /Path=\//);
  const parsed = parseCookies(`a=1; ${SESSION_COOKIE}=${encodeURIComponent("x.y.z")}; b=2`);
  assert.equal(parsed.a, "1");
  assert.equal(parsed[SESSION_COOKIE], "x.y.z");
  assert.equal(parsed.b, "2");
});

test("sessão cifrada: round-trip, expiração e validade", () => {
  const session = createSession({
    secret: SECRET,
    token: "gho_user",
    authorId: "U1",
    handle: "@um",
    now: NOW,
    ttlS: 3600,
  });
  const cookies = { [SESSION_COOKIE]: session.value };
  const read = readSession({ secret: SECRET, cookies, now: NOW });
  assert.equal(read.ok, true);
  assert.equal(read.payload.authorId, "U1");
  assert.equal(read.payload.csrf, session.csrf);

  const later = new Date(NOW.getTime() + 3601 * 1000);
  assert.equal(readSession({ secret: SECRET, cookies, now: later }).reason, "expired");
  assert.equal(readSession({ secret: SECRET, cookies: {}, now: NOW }).reason, "missing");
  const tampered = { [SESSION_COOKIE]: "v1.a.b.c" };
  assert.equal(readSession({ secret: SECRET, cookies: tampered, now: NOW }).reason, "invalid");

  const cookieHeader = sessionSetCookie(session.value, { secure: true, maxAge: 3600 });
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
});

test("estado OAuth cifrado: round-trip e expiração", () => {
  const state = createOAuthState({
    secret: SECRET,
    state: "state-1",
    verifier: "v".repeat(43),
    returnTo: "/pt/q/X/",
    now: NOW,
    ttlS: 600,
  });
  const read = readOAuthState({ secret: SECRET, cookies: { mielina_oauth: state.value }, now: NOW });
  assert.equal(read.ok, true);
  assert.equal(read.payload.state, "state-1");
  assert.equal(read.payload.returnTo, "/pt/q/X/");
  const later = new Date(NOW.getTime() + 601 * 1000);
  assert.equal(
    readOAuthState({ secret: SECRET, cookies: { mielina_oauth: state.value }, now: later }).reason,
    "expired"
  );
  const cookie = oauthSetCookie(state.value, { secure: true, maxAge: 600 });
  assert.match(cookie, /HttpOnly/);
});

/* --------------------------------------------------------- http helpers */

test("Origin é obrigatório e same-origin (base + allowlist)", () => {
  assert.deepEqual([...allowedOrigins(ENV)], ["https://noos.study", "http://localhost:3000"]);
  assert.doesNotThrow(() => assertAllowedOrigin(makeReq({ headers: { origin: "https://noos.study" } }), ENV));
  assert.throws(
    () => assertAllowedOrigin(makeReq({ headers: {} }), ENV),
    (error) => error instanceof HttpError && error.code === "ORIGIN_REQUIRED"
  );
  assert.throws(
    () => assertAllowedOrigin(makeReq({ headers: { origin: "https://evil.example" } }), ENV),
    (error) => error instanceof HttpError && error.code === "ORIGIN_FORBIDDEN"
  );
  assert.throws(
    () => allowedOrigins({ MIELINA_BASE_URL: "não é url" }),
    (error) => error instanceof HttpError && error.code === "ENV_INVALID"
  );
});

test("CSRF double-submit, método, env e IP", () => {
  const session = createSession({ secret: SECRET, token: "t", authorId: "U1", now: NOW });
  assert.doesNotThrow(() =>
    assertCsrf(makeReq({ headers: { "x-mielina-csrf": session.csrf } }), session.payload)
  );
  assert.throws(
    () => assertCsrf(makeReq({ headers: { "x-mielina-csrf": "errado" } }), session.payload),
    (error) => error.code === "CSRF_INVALID"
  );
  assert.throws(
    () => requireMethod(makeReq({ method: "POST" }), ["GET"]),
    (error) => error.status === 405 && error.code === "METHOD_NOT_ALLOWED"
  );
  assert.throws(
    () => requireEnv({}, ["AUSENTE"]),
    (error) => error.status === 503 && error.code === "ENV_MISSING"
  );
  assert.equal(clientIp(makeReq({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })), "1.2.3.4");
  assert.equal(clientIp(makeReq()), "unknown");
});

test("readJsonBody aceita corpo pré-parseado, string e stream; rejeita inválidos", async () => {
  assert.deepEqual(await readJsonBody(makeReq({ body: { a: 1 } })), { a: 1 });
  assert.deepEqual(
    await readJsonBody(makeReq({ body: '{"a":1}', headers: { "content-type": "application/json" } })),
    { a: 1 }
  );
  const streamReq = {
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{"a":');
      yield Buffer.from("2}");
    },
  };
  assert.deepEqual(await readJsonBody(streamReq), { a: 2 });

  await assert.rejects(
    () => readJsonBody(makeReq({ body: "{invalido", headers: { "content-type": "application/json" } })),
    (error) => error.code === "INVALID_JSON"
  );
  await assert.rejects(
    () => readJsonBody(makeReq({ body: {}, headers: { "content-type": "text/plain" } })),
    (error) => error.code === "UNSUPPORTED_MEDIA_TYPE"
  );
  await assert.rejects(
    () => readJsonBody(makeReq({ body: "[1,2]", headers: { "content-type": "application/json" } })),
    (error) => error.code === "INVALID_JSON"
  );
});

test("rate limit fixed window por chave", () => {
  const now = 1_000_000;
  assert.equal(rateLimit("k", { limit: 2, windowMs: 1000, now }).ok, true);
  assert.equal(rateLimit("k", { limit: 2, windowMs: 1000, now }).ok, true);
  const blocked = rateLimit("k", { limit: 2, windowMs: 1000, now: now + 100 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterS, 1);
  assert.equal(rateLimit("k", { limit: 2, windowMs: 1000, now: now + 1001 }).ok, true);
  const guardDeps = { env: ENV, now: () => new Date(now) };
  assert.doesNotThrow(() =>
    guardRateLimit(guardDeps, "guard", { limit: 1, windowMs: 1000 })
  );
  assert.throws(
    () => guardRateLimit(guardDeps, "guard", { limit: 1, windowMs: 1000 }),
    (error) => error.status === 429
  );
});

/* ------------------------------------------------------------- dados */

function rawFetchStub(files) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const pathname = new URL(url).pathname;
    const key = pathname.split("/main/")[1] || "";
    if (Object.prototype.hasOwnProperty.call(files, key)) {
      if (files[key] === 404) return textResponse("não encontrado", 404);
      return textResponse(typeof files[key] === "string" ? files[key] : JSON.stringify(files[key]));
    }
    return textResponse("não encontrado", 404);
  };
  impl.calls = calls;
  return impl;
}

test("loadReputation/loadSnapshot/loadManifestQuestion com cache e fail-safe", async () => {
  const files = {
    "discussao/reputation.json": {
      curators: [{ authorId: "U_CURATOR", role: "maintainer-curator" }],
      authors: { U1: { eligibleSupports: 30, officialCitedPosts: 4 } },
    },
    "discussao/RAN.json": { "RAN-DBDEA-00001": { discussionId: "D_1", synthesis: { version: 3 } } },
    "manifestos/RAN.jsonl": `${JSON.stringify({ id: "RAN-DBDEA-00001" })}\n`,
  };
  const fetchImpl = rawFetchStub(files);
  const deps = depsWith(fetchImpl);

  const reputation = await loadReputation(deps);
  assert.equal(reputation.ok, true);
  assert.equal(reputation.reputation.curators[0].authorId, "U_CURATOR");
  await loadReputation(deps);
  assert.equal(fetchImpl.calls.length, 1, "segunda leitura veio do cache");

  const snapshot = await loadSnapshot(deps, "RAN-DBDEA-00001");
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.snapshot.synthesis.version, 3);
  assert.equal((await loadSnapshot(deps, "RAN-DBDEA-99999")).snapshot, null);
  assert.equal((await loadSnapshot(deps, "inválido")).missing, true);

  const manifest = await loadManifestQuestion(deps, "RAN-DBDEA-00001");
  assert.equal(manifest.ok, true);
  assert.equal(manifest.found, true);

  // 404 em reputation = estado vazio (fail-safe), nunca erro.
  resetDataCache();
  const missingDeps = depsWith(rawFetchStub({}));
  const missing = await loadReputation(missingDeps);
  assert.equal(missing.ok, true);
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.reputation.curators, []);

  // Rede fora = ok:false (handler decide fail-closed).
  resetDataCache();
  const brokenDeps = depsWith(async () => {
    throw new Error("offline");
  });
  const broken = await loadReputation(brokenDeps);
  assert.equal(broken.ok, false);
});

/* ------------------------------------------------------- cliente GitHub */

function makeGitHub(fetchImpl, options = {}) {
  return new GitHubClient({
    token: "ghs_servidor",
    repo: "ironidesflj/noos-hub",
    fetchImpl,
    ...options,
  });
}

test("GitHubClient: queries, reações paginadas, REST e commit", async () => {
  const calls = { graphql: [], rest: [] };
  let reactionsPage = 0;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/graphql") {
      const body = JSON.parse(options.body);
      calls.graphql.push(body);
      if (body.query.includes("viewer")) {
        return jsonResponse({ data: { viewer: { id: "U1", login: "um" } } });
      }
      if (body.query.includes("discussions(first")) {
        return jsonResponse({
          data: {
            repository: {
              discussions: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ id: "D_1", title: "RAN-DBDEA-00001", url: "u", number: 1, createdAt: "x" }],
              },
            },
          },
        });
      }
      if (body.query.includes("reactions(first")) {
        reactionsPage += 1;
        const first = reactionsPage === 1;
        return jsonResponse({
          data: {
            node: {
              __typename: "DiscussionComment",
              reactions: {
                pageInfo: first ? { hasNextPage: true, endCursor: "c2" } : { hasNextPage: false, endCursor: null },
                nodes: first
                  ? [{ content: "ROCKET", user: { id: "U2", login: "dois", __typename: "User" } }]
                  : [{ content: "HEART", user: { id: "U3", login: "tres", __typename: "User" } }],
              },
            },
          },
        });
      }
      if (body.query.includes("addReaction")) {
        return jsonResponse({ data: { addReaction: { reaction: { content: "ROCKET" } } } });
      }
      if (body.query.includes("createCommitOnBranch")) {
        return jsonResponse({ data: { createCommitOnBranch: { commit: { oid: "abc", url: "https://x/commit/abc" } } } });
      }
      if (body.query.includes("node(id")) {
        return jsonResponse({
          data: {
            node: {
              __typename: "DiscussionComment",
              id: "DC_1",
              url: "u",
              body: "corpo",
              createdAt: "x",
              author: { id: "U_PROP", login: "prop" },
              discussion: { id: "D_1", number: 1, url: "du", title: "RAN-DBDEA-00001", repository: { nameWithOwner: "ironidesflj/noos-hub" } },
            },
          },
        });
      }
      return jsonResponse({ data: {} });
    }
    calls.rest.push({ path: parsed.pathname, method: options.method || "GET" });
    if (parsed.pathname.endsWith("/dispatches")) return emptyResponse(204);
    if (parsed.pathname.includes("/git/trees/")) {
      return jsonResponse({
        tree: [{ path: "discussao/RAN.json", type: "blob", sha: "blob1" }],
      });
    }
    if (parsed.pathname.includes("/git/blobs/")) {
      return jsonResponse({ encoding: "base64", content: Buffer.from('{"ok":1}', "utf8").toString("base64") });
    }
    if (parsed.pathname.includes("/git/ref/heads/")) {
      return jsonResponse({ object: { sha: "head123" } });
    }
    return jsonResponse({ message: "não esperado" }, 500);
  };

  const gh = makeGitHub(fetchImpl);
  assert.deepEqual(await gh.getViewer(), { authorId: "U1", handle: "@um" });
  const discussion = await gh.findDiscussionByTitle("RAN-DBDEA-00001");
  assert.equal(discussion.id, "D_1");

  const reactions = await gh.getAllReactions("DC_1");
  assert.equal(reactions.length, 2);
  assert.equal(reactions[1].user.id, "U3");

  await gh.addReaction("DC_1", "ROCKET");
  const comment = await gh.getDiscussionComment("DC_1");
  assert.equal(comment.authorId, "U_PROP");
  assert.equal(comment.discussion.repository, "ironidesflj/noos-hub");

  await gh.dispatchEvent("mielina-curadoria", { action: "approve" });
  const fileText = await gh.getRepoFileText("discussao/RAN.json", "main");
  assert.deepEqual(JSON.parse(fileText), { ok: 1 });
  const commit = await gh.commitFile({
    path: "discussao/RAN.json",
    content: "{}\n",
    headline: "curadoria: teste",
    body: "corpo",
  });
  assert.equal(commit.oid, "abc");
  const commitCall = calls.graphql.find((entry) => entry.query.includes("createCommitOnBranch"));
  assert.equal(commitCall.variables.input.expectedHeadOid, "head123");
});

test("GitHubClient: erros viram GitHubError com status seguro", async () => {
  const gh = makeGitHub(async () => jsonResponse({ message: "Forbidden" }, 403));
  await assert.rejects(
    () => gh.rest("/repos/x/y"),
    (error) => error instanceof GitHubError && error.status === 403 && /Forbidden/.test(error.message)
  );
  const noToken = new GitHubClient({ repo: "a/b", token: "" });
  await assert.rejects(
    () => noToken.graphql("query { viewer { id } }"),
    (error) => error.code === "ENV_MISSING" && error.status === 503
  );
  assert.throws(
    () => new GitHubClient({ repo: "invalido" }),
    (error) => error.code === "ENV_INVALID"
  );
});

test("translateError mapeia GitHub para HTTP sem vazar detalhe", () => {
  assert.equal(translateError(new GitHubError("x", { status: 401 })).status, 401);
  assert.equal(translateError(new GitHubError("x", { status: 401 })).code, "SESSION_EXPIRED");
  assert.equal(translateError(new GitHubError("x", { status: 403 })).code, "GITHUB_FORBIDDEN");
  assert.equal(translateError(new GitHubError("x", { status: 404 })).code, "GITHUB_NOT_FOUND");
  assert.equal(translateError(new GitHubError("x", { status: 500 })).status, 502);
  const http = new HttpError(400, "INVALID_PAYLOAD", "x");
  assert.equal(translateError(http), http);
  assert.equal(translateError(new Error("boom")).message, "boom");
});
