#!/usr/bin/env node
/**
 * Sincroniza os fios do GitHub Discussions para os dumps estáticos
 * discussao/{PREFIX}.json (F2.2). Roda FORA do build (armadilha #7 do kit):
 * nunca faça fetch no gera-questoes.mjs.
 *
 * Uso: GITHUB_TOKEN=... node scripts/sync-discussao.mjs [--dry]
 * Requer: repo público, Discussions habilitado, categoria Q&A, tópicos com
 * título = ID público (giscus) e comentários estruturados pelo compositor.
 *
 * Entrada do compositor no corpo do comentário:
 *   **Alternativa que confundiu:** C
 *   **O que a documentação oficial não conta de primeira:**
 *   ...
 *   **Fonte oficial:** https://...
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "ironidesflj/noos-hub";
const DRY = process.argv.includes("--dry");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
if (!TOKEN) {
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
        comments(first: 40) {
          nodes {
            author { login }
            body
            createdAt
            reactionGroups { content users { totalCount } }
          }
        }
      }
    }
  }
}`;

function parseStructured(body) {
  const text = String(body || "");
  const optMatch = text.match(/Alternativa que confundiu:\*\*\s*([A-D]|Geral)/i);
  const srcMatch = text.match(/Fonte oficial:\*\*\s*(https:\/\/[^\s)]+)/i);
  let explanation = text;
  const marker = text.match(/não conta de primeira:\*\*\s*([\s\S]*?)(?:\n\*\*Fonte oficial:\*\*|$)/i);
  if (marker) explanation = marker[1].trim();
  return {
    option: optMatch ? optMatch[1].toUpperCase() : "",
    sourceUrl: srcMatch ? srcMatch[1] : "",
    explanation: explanation.replace(/\s+\n/g, "\n").trim(),
  };
}

function tierOf(login) {
  const cfg = AUTHORS[login] || {};
  return { tier: Math.min(4, Math.max(1, Number(cfg.tier) || 1)), passed: cfg.passed === true };
}

const byPrefix = new Map();
let cursor = null;
let discussions = 0;
for (;;) {
  const data = await gql(QUERY, { cursor });
  const repo = data.repository.discussions;
  for (const d of repo.nodes) {
    const id = String(d.title || "").trim();
    const m = /^([A-Z]{3})-/.exec(id);
    if (!m) continue;
    const comments = d.comments.nodes
      .filter((c) => c.author?.login && c.author.login !== "giscus")
      .map((c) => {
        const parsed = parseStructured(c.body);
        const t = tierOf(c.author.login);
        const rockets = (c.reactionGroups || []).find((g) => g.content === "ROCKET")?.users?.totalCount ?? 0;
        return {
          handle: `@${c.author.login}`,
          tier: t.tier,
          passed: t.passed,
          option: parsed.option,
          body: parsed.explanation || String(c.body || "").trim(),
          sourceUrl: parsed.sourceUrl || "",
          accelerations: rockets,
          accepted: false,
          createdAt: c.createdAt,
        };
      })
      .filter((c) => c.body.length > 0);
    if (!comments.length) continue;
    const entry = byPrefix.get(m[1]) || {};
    entry[id] = { comments };
    byPrefix.set(m[1], entry);
    discussions += 1;
  }
  if (!repo.pageInfo.hasNextPage) break;
  cursor = repo.pageInfo.endCursor;
}

for (const [prefix, entries] of [...byPrefix.entries()].sort()) {
  const file = path.join(ROOT, "discussao", `${prefix}.json`);
  const ordered = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  const json = JSON.stringify(ordered, null, 2) + "\n";
  if (DRY) {
    console.log(`[dry] ${prefix}: ${Object.keys(entries).length} fio(s)`);
  } else {
    writeFileSync(file, json, "utf8");
    console.log(`${prefix}: ${Object.keys(entries).length} fio(s) → discussao/${prefix}.json`);
  }
}
console.log(`total: ${discussions} fio(s) com comentários`);
