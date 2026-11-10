#!/usr/bin/env node
/**
 * Sincroniza os fios do GitHub Discussions para os dumps estáticos
 * discussao/{PREFIX}.json (F2.2). Roda FORA do build (armadilha #7 do kit):
 * nunca faça fetch no gera-questoes.mjs.
 *
 * Uso: GITHUB_TOKEN=... node scripts/sync-discussao.mjs [--dry]
 * Requer: repo público, Discussions habilitado, categoria Q&A, tópicos com
 * título = ID público e postagens estruturadas pelo Compositor Guiado.
 *
 * Entrada do compositor no corpo da discussão / comentário:
 *   **Alternativa que confundiu:** C
 *   **Status:** ✦ Passei na prova!
 *
 *   **O que a documentação oficial não conta de primeira:**
 *   ...
 *
 *   **Fonte oficial:** https://...
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const IS_MAIN =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (IS_MAIN && !TOKEN) {
  console.error("GITHUB_TOKEN ausente");
  process.exit(1);
}
const AUTHORS = existsSync(path.join(ROOT, "discussao", "authors.json"))
  ? JSON.parse(readFileSync(path.join(ROOT, "discussao", "authors.json"), "utf8"))
  : {};

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const QUERY = `
query($cursor: String) {
  repository(owner: "ironidesflj", name: "noos-hub") {
    discussions(first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        title
        category { name }
        author { login }
        body
        createdAt
        reactionGroups { content users { totalCount } }
        answer {
          author { login }
          body
          createdAt
        }
        comments(first: 50) {
          nodes {
            author { login }
            body
            createdAt
            isAnswer
            reactionGroups { content users { totalCount } }
          }
        }
      }
    }
  }
}`;

export function parseStructured(body) {
  const text = String(body || "");
  const optMatch = text.match(/Alternativa que confundiu:\*\*\s*([A-D]|Geral)/i);
  const statusMatch = text.match(/\*\*Status:\*\*\s*([^\n]+)/i);
  const srcMatch = text.match(/Fonte oficial:\*\*\s*(https:\/\/[^\s)]+)/i);
  let explanation = text;
  const marker = text.match(/não conta de primeira:\*\*\s*([\s\S]*?)(?:\n\*\*Fonte oficial:\*\*|$)/i);
  if (marker) {
    explanation = marker[1].trim();
  } else {
    // Remove linhas de metadados estruturados caso o texto tenha formato parcial
    explanation = text
      .replace(/^\*\*Alternativa que confundiu:\*\*.*$/gim, "")
      .replace(/^\*\*Status:\*\*.*$/gim, "")
      .replace(/^\*\*Fonte oficial:\*\*.*$/gim, "")
      .trim();
  }
  const passedInBody = statusMatch ? /passei na prova|passed the exam/i.test(statusMatch[1]) : false;
  return {
    option: optMatch ? optMatch[1].toUpperCase() : "",
    passed: passedInBody,
    sourceUrl: srcMatch ? srcMatch[1] : "",
    explanation: explanation.replace(/\s+\n/g, "\n").trim(),
  };
}

function countAccelerations(reactionGroups) {
  if (!Array.isArray(reactionGroups)) return 0;
  let total = 0;
  for (const g of reactionGroups) {
    if (g?.content === "ROCKET" || g?.content === "THUMBS_UP" || g?.content === "HEART") {
      total += Number(g?.users?.totalCount) || 0;
    }
  }
  return total;
}

// Coleta todos os posts (raiz da discussão + comentários) para calcular a
// reputação derivada por atividade antes de consolidar os arquivos JSON.
const rawByQuestion = new Map();
const authorStats = new Map();

function recordAuthorActivity(login, { accelerations, hasSource, passed, accepted }) {
  const prev = authorStats.get(login) || {
    accelerations: 0,
    sourcedCount: 0,
    passed: false,
    acceptedCount: 0,
  };
  prev.accelerations += accelerations;
  if (hasSource) prev.sourcedCount += 1;
  if (passed) prev.passed = true;
  if (accepted) prev.acceptedCount += 1;
  authorStats.set(login, prev);
}

export function deriveAuthorTier(login, postPassed = false) {
  const cfg = AUTHORS[login] || {};
  const stats = authorStats.get(login) || {
    accelerations: 0,
    sourcedCount: 0,
    passed: false,
    acceptedCount: 0,
  };
  const passed = Boolean(postPassed || stats.passed || cfg.passed === true);
  let derivedTier = 1;
  if (passed) derivedTier = 2;
  if (stats.accelerations >= 25 && stats.sourcedCount >= 3) derivedTier = 3;
  if (stats.accelerations >= 100 || stats.acceptedCount >= 3) derivedTier = 4;
  const manualTier = Number(cfg.tier) || 0;
  const finalTier = Math.min(4, Math.max(1, derivedTier, manualTier));
  return { tier: finalTier, passed };
}

async function main() {
  let cursor = null;
  let discussionsCount = 0;
  for (;;) {
    const data = await gql(QUERY, { cursor });
    const repo = data.repository.discussions;
    for (const d of repo.nodes) {
      const id = String(d.title || "").trim();
      const m = /^([A-Z]{3})-/.exec(id);
      if (!m) continue;

      // 1. Inclui tanto o post raiz (criado pelo Compositor Guiado via /discussions/new)
      //    quanto as respostas em d.comments.nodes.
      const rawPosts = [];
      if (d.author?.login && d.author.login !== "giscus" && String(d.body || "").trim()) {
        rawPosts.push({
          login: d.author.login,
          body: d.body,
          createdAt: d.createdAt,
          reactionGroups: d.reactionGroups,
          isAnswer: false,
        });
      }
      for (const c of d.comments?.nodes || []) {
        if (!c?.author?.login || c.author.login === "giscus") continue;
        rawPosts.push({
          login: c.author.login,
          body: c.body,
          createdAt: c.createdAt,
          reactionGroups: c.reactionGroups,
          isAnswer: Boolean(c.isAnswer),
        });
      }

      const parsedPosts = rawPosts
        .map((p) => {
          const parsed = parseStructured(p.body);
          const accelerations = countAccelerations(p.reactionGroups);
          recordAuthorActivity(p.login, {
            accelerations,
            hasSource: Boolean(parsed.sourceUrl),
            passed: parsed.passed,
            accepted: p.isAnswer,
          });
          return {
            login: p.login,
            parsed,
            rawBody: String(p.body || "").trim(),
            accelerations,
            accepted: p.isAnswer,
            createdAt: p.createdAt,
          };
        })
        .filter((p) => (p.parsed.explanation || p.rawBody).length > 0);

      if (!parsedPosts.length) continue;
      const prefix = m[1];
      if (!rawByQuestion.has(prefix)) rawByQuestion.set(prefix, new Map());
      const prefixMap = rawByQuestion.get(prefix);
      const prevList = prefixMap.get(id) || [];
      prevList.push(...parsedPosts);
      prefixMap.set(id, prevList);
      discussionsCount += 1;
    }
    if (!repo.pageInfo.hasNextPage) break;
    cursor = repo.pageInfo.endCursor;
  }

  // 2. Consolida por prefixo preservando syntheses e dados curados já existentes
  for (const [prefix, questionMap] of [...rawByQuestion.entries()].sort()) {
    const file = path.join(ROOT, "discussao", `${prefix}.json`);
    const existing = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};

    const merged = { ...existing };

    for (const [id, posts] of questionMap.entries()) {
      const comments = posts.map((p) => {
        const rep = deriveAuthorTier(p.login, p.parsed.passed);
        return {
          handle: `@${p.login}`,
          tier: rep.tier,
          passed: rep.passed,
          option: p.parsed.option === "GERAL" ? "Geral" : p.parsed.option,
          body: p.parsed.explanation || p.rawBody,
          sourceUrl: p.parsed.sourceUrl || "",
          accelerations: p.accelerations,
          accepted: p.accepted,
          createdAt: p.createdAt,
        };
      });

      const prevEntry = existing[id] || {};
      merged[id] = {
        ...(prevEntry.synthesis ? { synthesis: prevEntry.synthesis } : {}),
        comments,
      };
    }

    const ordered = Object.fromEntries(
      Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
    );
    const json = JSON.stringify(ordered, null, 2) + "\n";
    if (DRY) {
      console.log(`[dry] ${prefix}: ${questionMap.size} fio(s) sincronizado(s) (${Object.keys(ordered).length} total)`);
    } else {
      writeFileSync(file, json, "utf8");
      console.log(`${prefix}: ${questionMap.size} fio(s) sincronizado(s) → discussao/${prefix}.json`);
    }
  }
  console.log(`total: ${discussionsCount} fio(s) com comentários`);
}

if (IS_MAIN) {
  await main();
}
