/**
 * A Camada de Mielina (v2) — hidratação progressiva (zero dependências).
 * Sem JS: questão, gabarito, síntese e contribuições continuam legíveis.
 * Tudo que vem de dados é texto (textContent), nunca innerHTML de usuário.
 */
(function () {
  "use strict";


/* Identidade/CSRF: o cookie de sessão é HttpOnly; o token CSRF vem de /me e é
   guardado só em memória (nunca localStorage). Toda escrita usa X-Mielina-CSRF. */
var MielinaMe = { value: null, pending: null };
function mielinaMe(force) {
  if (MielinaMe.value && !force) return Promise.resolve(MielinaMe.value);
  if (MielinaMe.pending && !force) return MielinaMe.pending;
  MielinaMe.pending = fetch("/api/mielina/me", { credentials: "same-origin" })
    .then(function (r) {
      if (r.ok) return r.json();
      return { authenticated: false, unavailable: true, status: r.status };
    })
    .then(function (me) { MielinaMe.value = me; MielinaMe.pending = null; return me; })
    .catch(function () { MielinaMe.pending = null; return { authenticated: false, unavailable: true }; });
  return MielinaMe.pending;
}
function mielinaJsonHeaders(extra) {
  var headers = { "content-type": "application/json" };
  if (MielinaMe.value && MielinaMe.value.csrfToken) headers["X-Mielina-CSRF"] = MielinaMe.value.csrfToken;
  if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
  return headers;
}
function mielinaLogin() {
  window.location.href = "/api/mielina/auth/login?returnTo=" + encodeURIComponent(window.location.pathname + window.location.hash);
}
/* Chamadas do apoio com timeout real: se o GitHub pendurar, o AbortController
   aborta e o catch do clique reconcilia via GET. Nada é somado localmente. */
var MIELINA_SUPPORT_TIMEOUT_MS = 12000;
async function mielinaFetchJson(url, options, timeoutMs) {
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var init = {};
  var key;
  if (options) {
    for (key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) init[key] = options[key];
    }
  }
  var timer = null;
  if (controller) {
    init.signal = controller.signal;
    timer = setTimeout(function () { controller.abort(); }, timeoutMs || MIELINA_SUPPORT_TIMEOUT_MS);
  }
  try {
    var res = await fetch(url, init);
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, ok: res.ok, data: data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
  var root = document.querySelector(".q-col-mielina");
  if (!root) return;

  var filterButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-filter], [data-filter-opt]")
  );
  var optBoxes = Array.prototype.slice.call(
    document.querySelectorAll("[data-opt-box]")
  );
  var composerOpt = document.querySelector("[data-composer-opt]");
  var state = { kind: "all", opt: null };

  function getCards() {
    return Array.prototype.slice.call(root.querySelectorAll(".mielina-card"));
  }

  function apply() {
    var cards = getCards();
    cards.forEach(function (card) {
      var opt = card.getAttribute("data-opt") || "";
      var passed = card.getAttribute("data-passed") === "1";
      var source = card.getAttribute("data-source") === "1";
      var show =
        state.kind === "all" ||
        (state.kind === "passed" && passed) ||
        (state.kind === "source" && source) ||
        (state.kind === "opt" && opt === state.opt);
      card.hidden = !show;
    });

    filterButtons.forEach(function (btn) {
      var isOpt = btn.hasAttribute("data-filter-opt");
      var pressed = isOpt
        ? state.kind === "opt" && state.opt === btn.getAttribute("data-filter-opt")
        : state.kind === btn.getAttribute("data-filter");
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    });

    optBoxes.forEach(function (box) {
      var letter = box.getAttribute("data-opt-box");
      if (state.kind === "opt" && state.opt === letter) {
        box.classList.add("is-filtered");
      } else {
        box.classList.remove("is-filtered");
      }
    });

    if (state.kind === "opt" && state.opt && composerOpt) {
      composerOpt.value = state.opt;
    }
  }

  filterButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.hasAttribute("data-filter-opt")) {
        var opt = btn.getAttribute("data-filter-opt");
        state =
          state.kind === "opt" && state.opt === opt
            ? { kind: "all", opt: null }
            : { kind: "opt", opt: opt };
        if (state.kind === "opt" && getCards().length === 0 && composerOpt) {
          composerOpt.value = opt;
          var bodyEl = document.querySelector("[data-composer-body]");
          if (bodyEl) bodyEl.focus();
        }
      } else {
        state = { kind: btn.getAttribute("data-filter") || "all", opt: null };
      }
      apply();
    });
  });

  // 1. Copiar URL canônica (Citar ID)
  var copyBtns = Array.prototype.slice.call(document.querySelectorAll("[data-copy-id]"));
  copyBtns.forEach(function (btn) {
    var origText = btn.textContent;
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-copy-id") || window.location.href;
      var doneLabel = btn.getAttribute("data-copy-done") || "✓ Copiado";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(function () {});
      }
      btn.textContent = doneLabel;
      setTimeout(function () {
        btn.textContent = origText;
      }, 2200);
    });
  });

  // 2. Painel dos 4 Níveis do Abraço da Esfera
  var tiersDrawer = document.querySelector("[data-tiers-drawer]");
  var tiersToggles = Array.prototype.slice.call(document.querySelectorAll("[data-tiers-toggle]"));
  var tiersClose = document.querySelector("[data-tiers-close]");

  if (tiersDrawer) {
    tiersToggles.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var willShow = tiersDrawer.hidden;
        tiersDrawer.hidden = !willShow;
        if (willShow && tiersDrawer.scrollIntoView) {
          tiersDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });
    if (tiersClose) {
      tiersClose.addEventListener("click", function () {
        tiersDrawer.hidden = true;
      });
    }
  }

  // 3. Ritual "Passei na prova!" — ativa com ?ritual=passed
  var params = new URLSearchParams(window.location.search);
  var ritual = document.querySelector("[data-ritual]");
  var composerRitualTag = document.querySelector("[data-composer-ritual-tag]");
  var composerFlair = document.querySelector("[data-composer-flair]");

  if (ritual && params.get("ritual") === "passed") {
    ritual.hidden = false;
    if (composerRitualTag) composerRitualTag.hidden = false;
    if (composerFlair) composerFlair.value = "passed";
    var trap = (params.get("trap") || "").toUpperCase();
    if (trap && "ABCD".indexOf(trap) !== -1) {
      if (composerOpt) composerOpt.value = trap;
      state = { kind: "opt", opt: trap };
      apply();
    }
  }
  if (ritual) {
    var dismiss = ritual.querySelector("[data-ritual-dismiss]");
    if (dismiss) {
      dismiss.addEventListener("click", function () {
        ritual.hidden = true;
        if (composerRitualTag) composerRitualTag.hidden = true;
        try {
          var url = new URL(window.location.href);
          url.searchParams.delete("ritual");
          url.searchParams.delete("trap");
          url.searchParams.delete("step");
          history.replaceState(null, "", url.toString());
        } catch (e) {
          /* sem history: apenas some */
        }
      });
    }
  }

  // 4. Histórico / Diff da Síntese Consolidada Wiki
  var historyBtn = root.querySelector("[data-wiki-history]");
  var wikiRead = root.querySelector("[data-wiki-read]");
  var wikiDiff = root.querySelector("[data-wiki-diff]");
  if (historyBtn && wikiRead && wikiDiff) {
    historyBtn.addEventListener("click", function () {
      var showingDiff = !wikiDiff.hidden;
      wikiDiff.hidden = showingDiff;
      wikiRead.hidden = !showingDiff;
      historyBtn.setAttribute("aria-pressed", showingDiff ? "false" : "true");
    });
  }

  // 5. Upvote real via API (1 conta = 1 apoio; sem localStorage)
  function clearLegacyVotes() {
    try {
      localStorage.removeItem("noos_upvotes_v1");
      Object.keys(localStorage)
        .filter((k) => k.indexOf("noos-vote-") === 0)
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      /* storage bloqueado */
    }
  }
  clearLegacyVotes();

  function questionId() {
    var syn = document.querySelector("[data-question-id]");
    if (syn) return syn.getAttribute("data-question-id") || "";
    var comp = document.querySelector(".mielina-composer");
    return comp ? comp.getAttribute("data-term") || "" : "";
  }

  function setVoteUi(btn, count, supported) {
    var num = btn.querySelector("[data-vote-num]");
    if (num && typeof count === "number") num.textContent = String(count);
    btn.setAttribute("data-voted", supported ? "true" : "false");
  }

  function bindVote(btn) {
    var subjectId = btn.getAttribute("data-subject-id");
    if (!subjectId) return;
    var status = btn.querySelector("[data-vote-status]");
    var isEn = document.documentElement.lang.indexOf("en") === 0;
    var selfMessage = isEn ? "You cannot support your own contribution." : "Você não pode acelerar sua própria contribuição.";
    function sayVote(message) { if (status) status.textContent = message; }
    var busy = false;
    btn.addEventListener("click", async function () {
      if (busy) return;
      busy = true;
      sayVote("");
      btn.setAttribute("aria-busy", "true");
      var desired = btn.getAttribute("data-voted") !== "true";
      try {
        var me = await mielinaMe();
        if (me.unavailable) {
          btn.title = "Participação autenticada indisponível: configure as variáveis MIELINA_* na Vercel.";
          btn.setAttribute("aria-busy", "false");
          return;
        }
        if (!me.authenticated) { mielinaLogin(); return; }
        if (me.authorId && me.authorId === btn.getAttribute("data-author-id")) {
          sayVote(selfMessage);
          return;
        }
        var res = await mielinaFetchJson(
          "/api/mielina/support",
          {
            method: "POST",
            headers: mielinaJsonHeaders(),
            body: JSON.stringify({ subjectId: subjectId, desiredState: desired, questionId: questionId() }),
          },
          MIELINA_SUPPORT_TIMEOUT_MS
        );
        if (res.status === 401) { mielinaLogin(); return; }
        if (!res.ok && res.data && res.data.error === "SELF_SUPPORT") {
          sayVote(selfMessage);
          return;
        }
        if (!res.ok) throw new Error("support " + res.status);
        if (!res.data || typeof res.data.count !== "number") throw new Error("support sem contagem");
        setVoteUi(btn, res.data.count, res.data.viewerSupported === true);
      } catch (e) {
        sayVote(isEn ? "Could not confirm your support. Try again." : "Não foi possível confirmar o apoio. Tente novamente.");
        // Timeout/erro: reconciliação autoritativa via GET; nunca soma local fantasma.
        try {
          var r = await mielinaFetchJson(
            "/api/mielina/support?subjectId=" + encodeURIComponent(subjectId),
            { method: "GET" },
            MIELINA_SUPPORT_TIMEOUT_MS
          );
          if (r.ok && r.data && typeof r.data.count === "number") {
            setVoteUi(btn, r.data.count, r.data.viewerSupported === true);
          }
        } catch (e2) {
          /* sem rede: mantém estado anterior */
        }
      } finally {
        busy = false;
        btn.setAttribute("aria-busy", "false");
      }
    });
  }
  Array.prototype.slice.call(root.querySelectorAll("[data-upvote]")).forEach(bindVote);

  // 6. Curadoria inline: só aparece com sessão/tier confirmados pela API.
  /* Curadoria é ON-DEMAND: nenhuma chamada de API no carregamento.
     O botão só consulta a sessão/tier quando o visitante decide participar. */
  var synEl = document.querySelector("#sintese-wiki");
  if (synEl) {
    var curationBtn = synEl.querySelector("[data-curation-open]");
    var curationLoaded = false;
    function loadCuration() {
      if (curationLoaded) return;
      curationLoaded = true;
      mielinaMe(true)
        .then(function (me) {
          if (me && me.unavailable) return; // sem API configurada: mantém leitura estática
          if (!me || !me.authenticated) { mielinaLogin(); return; }
          var isCurator = me.isCurator === true;
          var tier = Number(me.tier) || 1;
          if (tier < 3 && !isCurator) return;
          var propose = synEl.querySelector("[data-propose-panel]");
          if (propose) propose.hidden = false;
          var list = synEl.querySelector("[data-revision-list]");
          if (list) list.hidden = false;
          if (tier >= 4 || isCurator) {
            synEl.querySelectorAll("[data-approve-proposal]").forEach(function (b) { b.hidden = false; });
          }
        })
        .catch(function () { curationLoaded = false; });
    }
    if (curationBtn) curationBtn.addEventListener("click", loadCuration);

    var approveBtns = synEl.querySelectorAll("[data-approve-proposal]");
    approveBtns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.setAttribute("aria-busy", "true");
        try {
          var me = await mielinaMe();
          if (!me.authenticated) { mielinaLogin(); return; }
          var res = await fetch("/api/mielina/synthesis/approve", {
            method: "POST",
            headers: mielinaJsonHeaders(),
            body: JSON.stringify({
              questionId: questionId(),
              proposalId: btn.getAttribute("data-approve-proposal"),
              baseVersion: Number(btn.getAttribute("data-base-version")),
              contentHash: btn.getAttribute("data-content-hash"),
            }),
          });
          if (res.status === 403) throw new Error("forbidden");
          if (!res.ok) throw new Error("approve " + res.status);
          window.location.reload();
        } catch (e) {
          btn.setAttribute("aria-busy", "false");
        }
      });
    });
    var restoreBtns = synEl.querySelectorAll("[data-revision-restore]");
    restoreBtns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var reason = window.prompt(
          (document.documentElement.lang || "pt").indexOf("pt") === 0
            ? "Motivo da restauração (auditável):"
            : "Restore reason (auditable):"
        );
        if (!reason || reason.trim().length < 10) return;
        btn.setAttribute("aria-busy", "true");
        try {
          var me = await mielinaMe();
          if (!me.authenticated) { mielinaLogin(); return; }
          var res = await fetch("/api/mielina/synthesis/revert", {
            method: "POST",
            headers: mielinaJsonHeaders(),
            body: JSON.stringify({
              questionId: questionId(),
              baseVersion: Number(btn.getAttribute("data-base-version")),
              targetVersion: Number(btn.getAttribute("data-revision-restore")),
              reason: reason,
            }),
          });
          if (!res.ok) throw new Error("revert " + res.status);
          window.location.reload();
        } catch (e) {
          btn.setAttribute("aria-busy", "false");
        }
      });
    });
    var proposeSubmit = synEl.querySelector("[data-propose-submit]");
    if (proposeSubmit) {
      proposeSubmit.addEventListener("click", async function () {
        var bodyEl = synEl.querySelector("[data-propose-body]");
        var sourceEl = synEl.querySelector("[data-propose-source]");
        var statusEl = synEl.querySelector("[data-propose-status]");
        var text = (bodyEl && bodyEl.value ? bodyEl.value : "").trim();
        if (text.length < 30) {
          if (statusEl) statusEl.textContent = "Escreva ao menos 30 caracteres.";
          return;
        }
        var sourceValue = sourceEl && sourceEl.value ? sourceEl.value.trim() : "";
        if (!/^https:\/\//i.test(sourceValue)) {
          if (statusEl) statusEl.textContent = "Proposta exige fonte oficial https://.";
          if (sourceEl) sourceEl.focus();
          return;
        }
        proposeSubmit.setAttribute("aria-busy", "true");
        try {
          var me = await mielinaMe();
          if (!me.authenticated) { mielinaLogin(); return; }
          var res = await fetch("/api/mielina/synthesis/propose", {
            method: "POST",
            headers: mielinaJsonHeaders(),
            body: JSON.stringify({
              questionId: questionId(),
              body: text,
              sourceUrl: sourceEl && sourceEl.value ? sourceEl.value.trim() : "",
            }),
          });
          if (res.status === 403) {
            if (statusEl) statusEl.textContent = "Nível 3+ necessário.";
            return;
          }
          if (!res.ok) throw new Error("propose " + res.status);
          if (statusEl) statusEl.textContent = "Proposta enviada.";
        } catch (e) {
          if (statusEl) statusEl.textContent = "Falha ao enviar.";
        } finally {
          proposeSubmit.setAttribute("aria-busy", "false");
        }
      });
    }
  }
})();

/* ---- Compositor guiado (ritual "Passei na prova!") ----
   Renderiza card otimista na camada local e abre a Discussion estruturada
   no GitHub (categoria Q&A) para sincronização pública. */
(function () {
  "use strict";
  var composer = document.querySelector(".mielina-composer");
  if (!composer) return;
  var publish = composer.querySelector("[data-composer-publish]");
  var status = composer.querySelector("[data-composer-status]");
  var opt = composer.querySelector("[data-composer-opt]");
  var flair = composer.querySelector("[data-composer-flair]");
  var body = composer.querySelector("[data-composer-body]");
  var source = composer.querySelector("[data-composer-source]");
  if (!publish || !body) return;

  function say(msg) {
    if (status) status.textContent = msg || "";
  }

  publish.addEventListener("click", async function () {
    var text = (body.value || "").trim();
    if (text.length < 15) {
      say(composer.getAttribute("data-msg-missing") || "Escreva a explicação.");
      body.focus();
      return;
    }
    var url = (source && source.value ? source.value : "").trim();
    if (url && /^https?:\/\//i.test(url)) {
      var ok = false;
      try {
        ok = new URL(url).protocol === "https:";
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        say(composer.getAttribute("data-msg-badurl") || "Fonte precisa ser https://");
        if (source) source.focus();
        return;
      }
    }

    var chosenOpt = opt ? opt.value : "Geral";
    var isPassed = !flair || flair.value === "passed";
    var term = composer.getAttribute("data-term") || "";
    var repo = composer.getAttribute("data-repo") || "";
    var cat = composer.getAttribute("data-category") || "q-a";

    // Adiciona card otimista na lista para feedback imediato
    var threadList = document.querySelector("[data-thread-list]");
    var emptyBox = document.querySelector("[data-empty-thread]");
    if (emptyBox) emptyBox.hidden = true;
    if (threadList) {
      var card = document.createElement("article");
      card.className = "mielina-card";
      card.setAttribute("data-opt", chosenOpt);
      card.setAttribute("data-passed", isPassed ? "1" : "0");
      card.setAttribute("data-source", url ? "1" : "0");
      card.style.borderColor = "var(--accent)";

      var head = document.createElement("header");
      head.className = "mielina-card-head";
      var authorDiv = document.createElement("div");
      authorDiv.className = "mielina-card-author";
      var idDiv = document.createElement("div");
      idDiv.className = "mielina-card-id";
      var rowDiv = document.createElement("div");
      rowDiv.className = "mielina-handle-row";

      var hSpan = document.createElement("span");
      hSpan.className = "mielina-handle";
      hSpan.textContent = "@voce";
      rowDiv.appendChild(hSpan);

      if (isPassed) {
        var bPass = document.createElement("span");
        bPass.className = "badge-passed";
        bPass.textContent = "✦ Passei na prova · Nível 2";
        rowDiv.appendChild(bPass);
      }
      if (chosenOpt && chosenOpt !== "Geral") {
        var bOpt = document.createElement("span");
        bOpt.className = "badge-trap";
        bOpt.textContent = "Alternativa " + chosenOpt;
        rowDiv.appendChild(bOpt);
      }

      idDiv.appendChild(rowDiv);
      authorDiv.appendChild(idDiv);
      head.appendChild(authorDiv);

      var pBody = document.createElement("p");
      pBody.className = "mielina-card-body";
      pBody.textContent = text;

      card.appendChild(head);
      card.appendChild(pBody);
      threadList.insertBefore(card, threadList.children[1] || null);
    }

    if (isPassed) {
      var scoreEl = document.querySelector("[data-approved-count]");
      if (scoreEl) {
        scoreEl.textContent = String((parseInt(scoreEl.textContent, 10) || 0) + 1);
      }
    }

    // Publica via API de Mielina (autenticada); fallback para GitHub Discussions
    // se a API ainda não estiver configurada/responder 503.
    var apiOk = false;
    try {
      var me = await mielinaMe();
      if (me.unavailable) throw new Error("api-unavailable"); // cai no fallback GitHub Discussions
      if (!me.authenticated) { mielinaLogin(); return; }
      var res = await fetch("/api/mielina/comment", {
        method: "POST",
        headers: mielinaJsonHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ questionId: term, option: chosenOpt, selfDeclaredPassed: isPassed, body: text, sourceUrl: url }),
      });
      if (res.status === 401) { mielinaLogin(); return; }
      apiOk = res.ok;
      if (apiOk) {
        var data = await res.json().catch(function () { return {}; });
        say(composer.getAttribute("data-msg-ready") || "Publicado.");
        if (data && data.subjectId) {
          var cards = document.querySelectorAll(".mielina-card");
          var last = cards[cards.length - 1];
          if (last) last.setAttribute("data-subject-id", data.subjectId);
        }
      }
    } catch (e) {
      apiOk = false;
    }
    say(composer.getAttribute("data-msg-ready") || "Abrindo…");
    body.value = "";
    if (source) source.value = "";

    if (!apiOk && term && repo) {
      var md =
        "**Alternativa que confundiu:** " + chosenOpt + "\n" +
        "**Status:** " + (isPassed ? "✦ Passei na prova!" : "Estudando agora") + "\n\n" +
        "**O que a documentação oficial não conta de primeira:**\n" + text + "\n\n" +
        (url ? "**Fonte oficial:** " + url + "\n" : "");
      var target =
        "https://github.com/" +
        repo +
        "/discussions/new?category=" +
        encodeURIComponent(cat) +
        "&title=" +
        encodeURIComponent(term) +
        "&body=" +
        encodeURIComponent(md);
      window.open(target, "_blank", "noopener,noreferrer");
    }
  });
})();
