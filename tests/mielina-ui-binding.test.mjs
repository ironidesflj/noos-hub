/**
 * Regressão do binding da curadoria em js/mielina.js (PR #26).
 *
 * Bug: os listeners de [data-propose-submit], [data-revision-restore] e
 * [data-approve-proposal] ficavam dentro de `if (proposalList)`, onde
 * `proposalList = synEl.querySelector("[data-proposals-list]")`. Mas
 * [data-proposals-list] só é renderizado quando JÁ existe proposta pendente
 * (build/gera-questoes.mjs, pendingBlock). Logo, a PRIMEIRA proposta de
 * qualquer questão nunca era enviável: o clique era inerte, nenhum request
 * saía e o painel de curadoria parecia "quebrado" só na primeira vez.
 *
 * Este teste carrega js/mielina.js (IIFE de browser, sem exports) num DOM fake
 * mínimo — sem jsdom, sem dependências novas — e prova, pelo comportamento,
 * que os cliques disparam o POST correto mesmo SEM [data-proposals-list] no DOM.
 *
 * FRAGILIDADE CONHECIDA: o stub é acoplado aos seletores/globais atuais do
 * IIFE. Se js/mielina.js passar a usar event delegation, `closest()`, `matches()`
 * ou outra API de DOM não implementada aqui, o teste quebra com TypeError e
 * precisa do stub atualizado (não é bug de produto).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const MODULE_URL = new URL("../js/mielina.js", import.meta.url);

const QID = "RAN-TESTE-00001";
const CSRF = "csrf-teste";
const PROPOSE_URL = "/api/mielina/synthesis/propose";
const REVERT_URL = "/api/mielina/synthesis/revert";
const BODY_OK = "Síntese consolidada que corrige a alternativa correta e cita a fonte oficial.";
const SOURCE_OK = "https://learn.microsoft.com/pt-br/dotnet/csharp/";
const REASON_OK = "Restaurar a versão anterior: a fonte oficial estava incorreta.";

/* ------------------------------------------------------------------ */
/* DOM fake mínimo                                                    */
/* ------------------------------------------------------------------ */

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Elemento fake: guarda atributos e listeners; não faz parte de uma árvore real. */
function makeElement(tag, attributes = {}) {
  const listeners = new Map();
  const attrs = new Map(Object.entries(attributes).map(([name, value]) => [name, String(value)]));
  const element = {
    tagName: tag.toUpperCase(),
    hidden: false,
    value: "",
    textContent: "",
    className: attrs.get("class") || "",
    style: {},
    focused: false,
    children: [],
    classList: {
      _set: new Set(String(attrs.get("class") || "").split(/\s+/).filter(Boolean)),
      add(...names) {
        names.forEach((name) => this._set.add(name));
      },
      remove(...names) {
        names.forEach((name) => this._set.delete(name));
      },
      contains(name) {
        return this._set.has(name);
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    /** Dispara o handler e espera handlers async terminarem (await completo). */
    async dispatch(type, event = {}) {
      const evt = Object.assign({ type, target: element, preventDefault() {} }, event);
      const results = (listeners.get(type) || []).map((handler) => handler.call(element, evt));
      await Promise.all(results);
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    focus() {
      element.focused = true;
    },
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    insertBefore(child) {
      element.children.push(child);
      return child;
    },
    scrollIntoView() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return element;
}

class FakeStorage {
  constructor() {
    this._data = new Map();
  }
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }
  setItem(key, value) {
    this._data.set(key, String(value));
  }
  removeItem(key) {
    this._data.delete(key);
  }
  clear() {
    this._data.clear();
  }
}

/** Stub de fetch: registra chamadas e responde /me autenticado + POSTs com 200. */
function createFetch(calls) {
  return async function fakeFetch(url, options = {}) {
    const method = options && options.method ? options.method : "GET";
    calls.push({ url: String(url), method, options });
    if (String(url).indexOf("/api/mielina/me") !== -1) {
      return jsonResponse({ authenticated: true, tier: 4, isCurator: true, csrfToken: CSRF });
    }
    return jsonResponse({ ok: true });
  };
}

/**
 * Mundo fake de uma questão SEM proposta pendente:
 * - [data-proposals-list] NÃO existe no mapa de propósito (cenário do bug);
 * - #sintese-wiki carrega data-question-id, como no HTML gerado;
 * - o painel de proposta e a lista de revisões existem, mas começam hidden.
 */
function createWorld() {
  const calls = [];
  const state = { promptValue: "", prompts: 0, reloads: 0, opened: 0 };

  const root = makeElement("div", { class: "q-col-mielina" });
  const synEl = makeElement("section", { id: "sintese-wiki", "data-question-id": QID });
  const curationOpen = makeElement("button", { "data-curation-open": "" });
  const proposePanel = makeElement("div", { "data-propose-panel": "" });
  proposePanel.hidden = true;
  const revisionList = makeElement("div", { "data-revision-list": "" });
  revisionList.hidden = true;
  const proposeBody = makeElement("textarea", { "data-propose-body": "" });
  const proposeSource = makeElement("input", { "data-propose-source": "" });
  const proposeStatus = makeElement("span", { "data-propose-status": "" });
  const proposeSubmit = makeElement("button", { "data-propose-submit": "" });
  const revisionRestore = makeElement("button", {
    "data-revision-restore": "2",
    "data-base-version": "3",
  });

  const synLookup = new Map([
    ["[data-curation-open]", curationOpen],
    ["[data-propose-panel]", proposePanel],
    ["[data-revision-list]", revisionList],
    ["[data-propose-body]", proposeBody],
    ["[data-propose-source]", proposeSource],
    ["[data-propose-status]", proposeStatus],
    ["[data-propose-submit]", proposeSubmit],
    // [data-proposals-list] fica de fora de propósito: é o caso real da primeira proposta.
  ]);
  synEl.querySelector = (selector) => (synLookup.has(selector) ? synLookup.get(selector) : null);

  const synLists = new Map([
    ["[data-revision-restore]", [revisionRestore]],
    ["[data-approve-proposal]", []],
  ]);
  synEl.querySelectorAll = (selector) => (synLists.has(selector) ? synLists.get(selector) : []);

  const document = {
    documentElement: { lang: "pt" },
    querySelector(selector) {
      if (selector === ".q-col-mielina") return root;
      if (selector === "#sintese-wiki") return synEl;
      // No HTML real o atributo data-question-id fica na própria #sintese-wiki.
      if (selector === "[data-question-id]") return synEl;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return makeElement(tag);
    },
  };

  const window = {
    location: {
      href: "https://noos.study/pt/q/" + QID + "/",
      search: "",
      hash: "",
      pathname: "/pt/q/" + QID + "/",
      reload() {
        state.reloads += 1;
      },
    },
    prompt() {
      state.prompts += 1;
      return state.promptValue;
    },
    open() {
      state.opened += 1;
    },
  };

  return {
    calls,
    state,
    globals: { window, document, localStorage: new FakeStorage(), fetch: createFetch(calls) },
    els: {
      root,
      synEl,
      curationOpen,
      proposePanel,
      revisionList,
      proposeBody,
      proposeSource,
      proposeStatus,
      proposeSubmit,
      revisionRestore,
    },
  };
}

const GLOBAL_KEYS = ["window", "document", "localStorage", "fetch"];
let importCount = 0;

/** Instala o DOM fake, importa o IIFE com cache-busting e restaura tudo no finally. */
async function withFakeDom(run) {
  const world = createWorld();
  const saved = GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  try {
    GLOBAL_KEYS.forEach((key) => {
      Object.defineProperty(globalThis, key, {
        value: world.globals[key],
        configurable: true,
        writable: true,
        enumerable: true,
      });
    });
    importCount += 1;
    const moduleUrl = new URL(MODULE_URL);
    moduleUrl.searchParams.set("fresh", String(importCount));
    await import(moduleUrl.href);
    await flush();
    await run(world);
  } finally {
    saved.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
}

function posts(world, url) {
  return world.calls.filter((call) => call.method === "POST" && call.url === url);
}

/* ------------------------------------------------------------------ */
/* Testes                                                             */
/* ------------------------------------------------------------------ */

test("sem [data-proposals-list], Enviar proposta faz POST /synthesis/propose com CSRF e payload", async () => {
  await withFakeDom(async (world) => {
    // Curadoria é on-demand: carregar a página não chama API nenhuma.
    assert.equal(world.calls.length, 0, "nenhuma chamada de API antes de abrir a curadoria");
    assert.equal(world.els.proposePanel.hidden, true, "painel começa hidden no HTML");

    await world.els.curationOpen.dispatch("click");
    await flush();
    assert.equal(world.els.proposePanel.hidden, false, "painel de proposta revelado");
    assert.equal(world.els.revisionList.hidden, false, "lista de revisões revelada");
    assert.equal(world.calls.filter((call) => call.url === "/api/mielina/me").length, 1);

    world.els.proposeBody.value = "  " + BODY_OK + "  ";
    world.els.proposeSource.value = "  " + SOURCE_OK + " ";
    await world.els.proposeSubmit.dispatch("click");
    await flush();

    const proposePosts = posts(world, PROPOSE_URL);
    assert.equal(
      proposePosts.length,
      1,
      "sem [data-proposals-list] o botão precisa estar conectado (com o bug o clique é inerte)"
    );
    assert.equal(proposePosts[0].options.method, "POST");
    assert.deepEqual(proposePosts[0].options.headers, {
      "content-type": "application/json",
      "X-Mielina-CSRF": CSRF,
    });
    assert.deepEqual(JSON.parse(proposePosts[0].options.body), {
      questionId: QID,
      body: BODY_OK,
      sourceUrl: SOURCE_OK,
    });
    assert.equal(world.els.proposeStatus.textContent, "Proposta enviada.");
    assert.equal(world.els.proposeSubmit.getAttribute("aria-busy"), "false");
  });
});

test("sem [data-proposals-list], Restaurar versão faz POST /synthesis/revert após prompt válido", async () => {
  await withFakeDom(async (world) => {
    world.state.promptValue = REASON_OK;
    await world.els.curationOpen.dispatch("click");
    await flush();
    assert.equal(world.els.revisionList.hidden, false);

    await world.els.revisionRestore.dispatch("click");
    await flush();

    const revertPosts = posts(world, REVERT_URL);
    assert.equal(
      revertPosts.length,
      1,
      "sem [data-proposals-list] o botão de restaurar também precisa estar conectado"
    );
    assert.deepEqual(revertPosts[0].options.headers, {
      "content-type": "application/json",
      "X-Mielina-CSRF": CSRF,
    });
    assert.deepEqual(JSON.parse(revertPosts[0].options.body), {
      questionId: QID,
      baseVersion: 3,
      targetVersion: 2,
      reason: REASON_OK,
    });
    assert.equal(world.state.prompts, 1, "motivo auditável pedido uma vez");
    assert.equal(world.state.reloads, 1, "sucesso recarrega a página");
  });
});

test("guarda de entrada: body com menos de 30 caracteres não dispara POST", async () => {
  await withFakeDom(async (world) => {
    await world.els.curationOpen.dispatch("click");
    await flush();
    const callsBefore = world.calls.length;

    world.els.proposeBody.value = "curta demais";
    world.els.proposeSource.value = SOURCE_OK;
    await world.els.proposeSubmit.dispatch("click");
    await flush();

    assert.equal(world.calls.length, callsBefore, "nenhuma chamada nova, nem /me nem POST");
    assert.equal(posts(world, PROPOSE_URL).length, 0);
    assert.equal(world.els.proposeStatus.textContent, "Escreva ao menos 30 caracteres.");
    assert.equal(world.els.proposeSubmit.getAttribute("aria-busy"), null);
  });
});

test("fonte que não é https:// não dispara POST e orienta o campo", async () => {
  await withFakeDom(async (world) => {
    await world.els.curationOpen.dispatch("click");
    await flush();
    const callsBefore = world.calls.length;

    world.els.proposeBody.value = BODY_OK;
    world.els.proposeSource.value = "http://exemplo.test/fonte-insegura";
    await world.els.proposeSubmit.dispatch("click");
    await flush();

    assert.equal(world.calls.length, callsBefore);
    assert.equal(posts(world, PROPOSE_URL).length, 0);
    assert.equal(world.els.proposeStatus.textContent, "Proposta exige fonte oficial https://.");
    assert.equal(world.els.proposeSource.focused, true, "campo de fonte recebe foco");
  });
});
