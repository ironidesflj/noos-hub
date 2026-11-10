/**
 * A Camada de Mielina (v2) — hidratação progressiva (zero dependências).
 * Sem JS: questão, gabarito, síntese e contribuições continuam legíveis.
 * Tudo que vem de dados é texto (textContent), nunca innerHTML de usuário.
 */
(function () {
  "use strict";
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

  // 5. Upvote interativo ("▲ Acelerou meu estudo") com persistência local
  function bindUpvote(btn) {
    var key = "noos-vote-" + (btn.getAttribute("data-upvote") || "");
    var numEl = btn.querySelector("[data-vote-num]");
    try {
      if (localStorage.getItem(key) === "1" && numEl) {
        btn.setAttribute("data-voted", "true");
        numEl.textContent = String((parseInt(numEl.textContent, 10) || 0) + 1);
      }
    } catch (e) {}

    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-voted") === "true") return;
      btn.setAttribute("data-voted", "true");
      if (numEl) {
        numEl.textContent = String((parseInt(numEl.textContent, 10) || 0) + 1);
      }
      try {
        localStorage.setItem(key, "1");
      } catch (e) {}
    });
  }

  Array.prototype.slice
    .call(root.querySelectorAll("[data-upvote]"))
    .forEach(bindUpvote);
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

  publish.addEventListener("click", function () {
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

    say(composer.getAttribute("data-msg-ready") || "Abrindo…");
    body.value = "";
    if (source) source.value = "";

    if (term && repo) {
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
