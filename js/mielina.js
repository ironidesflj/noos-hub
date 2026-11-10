/**
 * A Camada de Mielina — hidratação progressiva (zero dependências).
 * Sem JS: questão, gabarito, síntese e contribuições continuam legíveis.
 * Tudo que vem de dados é texto (textContent), nunca innerHTML.
 */
(function () {
  "use strict";
  var root = document.querySelector(".q-col-mielina");
  if (!root) return;

  var cards = Array.prototype.slice.call(root.querySelectorAll(".mielina-card"));
  var filterButtons = Array.prototype.slice.call(root.querySelectorAll("[data-filter], [data-filter-opt]"));
  var state = { kind: "all", opt: null };

  function apply() {
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
      var pressed = isOpt ? state.kind === "opt" && state.opt === btn.getAttribute("data-filter-opt") : state.kind === btn.getAttribute("data-filter");
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
  }

  filterButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.hasAttribute("data-filter-opt")) {
        var opt = btn.getAttribute("data-filter-opt");
        state = state.kind === "opt" && state.opt === opt ? { kind: "all", opt: null } : { kind: "opt", opt: opt };
      } else {
        state = { kind: btn.getAttribute("data-filter") || "all", opt: null };
      }
      apply();
    });
  });

  // Ritual "Passei na prova!" — só ativa com querystring pública (?ritual=passed).
  var params = new URLSearchParams(window.location.search);
  var ritual = root.querySelector("[data-ritual]");
  if (ritual && params.get("ritual") === "passed") {
    ritual.hidden = false;
    var trap = (params.get("trap") || "").toUpperCase();
    if (trap && "ABCD".indexOf(trap) !== -1) {
      var trapBtn = root.querySelector('[data-filter-opt="' + trap + '"]');
      if (trapBtn) trapBtn.setAttribute("title", "Alternativa que te confundiu");
    }
  }
  if (ritual) {
    var dismiss = ritual.querySelector("[data-ritual-dismiss]");
    if (dismiss) {
      dismiss.addEventListener("click", function () {
        ritual.hidden = true;
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

  // Histórico/Diff: placeholder honesto até o dump de revisões existir.
  var history = root.querySelector("[data-wiki-history]");
  if (history) {
    history.addEventListener("click", function () {
      history.textContent = history.getAttribute("data-label-empty") || history.textContent;
      history.setAttribute("disabled", "disabled");
    });
  }
})();

/* ---- Compositor guiado (ritual "Passei na prova!") ----
   Sem backend: monta a Discussion no GitHub (categoria Q&A) com corpo
   estruturado, que o giscus renderiza e o sync de dumps captura depois. */
(function () {
  "use strict";
  var composer = document.querySelector(".mielina-composer");
  if (!composer) return;
  var publish = composer.querySelector("[data-composer-publish]");
  var status = composer.querySelector("[data-composer-status]");
  var opt = composer.querySelector("[data-composer-opt]");
  var body = composer.querySelector("[data-composer-body]");
  var source = composer.querySelector("[data-composer-source]");
  if (!publish || !body) return;

  function say(msg) {
    if (status) status.textContent = msg || "";
  }

  publish.addEventListener("click", function () {
    var text = (body.value || "").trim();
    if (text.length < 20) {
      say(composer.getAttribute("data-msg-missing") || "Escreva a explicação.");
      body.focus();
      return;
    }
    var url = (source.value || "").trim();
    if (url) {
      var ok = false;
      try { ok = new URL(url).protocol === "https:"; } catch (e) { ok = false; }
      if (!ok) {
        say(composer.getAttribute("data-msg-badurl") || "Fonte precisa ser https://");
        source.focus();
        return;
      }
    }
    var term = composer.getAttribute("data-term") || "";
    var repo = composer.getAttribute("data-repo") || "";
    var cat = composer.getAttribute("data-category") || "q-a";
    if (!term || !repo) return;
    var md =
      "**Alternativa que confundiu:** " + (opt ? opt.value : "Geral") + "\n\n" +
      "**O que a documentação oficial não conta de primeira:**\n" + text + "\n\n" +
      (url ? "**Fonte oficial:** " + url + "\n" : "");
    var target = "https://github.com/" + repo + "/discussions/new?category=" + encodeURIComponent(cat) +
      "&title=" + encodeURIComponent(term) + "&body=" + encodeURIComponent(md);
    say(composer.getAttribute("data-msg-ready") || "Abrindo…");
    window.open(target, "_blank", "noopener,noreferrer");
  });
})();
