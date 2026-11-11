#!/usr/bin/env node
/**
 * Sync dos fios do GitHub Discussions → dumps estáticos (F2.2).
 * Fase 2 do handoff-arquitetura-definitiva-mielina:
 *  - paginação completa (discussions, comments, replies, reactions);
 *  - all-or-nothing: qualquer falha aborta ANTES de tocar nos JSONs;
 *  - dedupe de discussões pelo título (a mais antiga é canônica);
 *  - IDs permanentes (subjectId/authorId), nunca índice posicional;
 *  - apoio único por conta (ROCKET/THUMBS_UP/HEART, sem bots/auto-apoio);
 *  - selo "Fonte oficial citada" via allowlist por prefixo;
 *  - tiers 1–4 derivados da atividade + curadores explícitos;
 *  - preserva `synthesis` (revisões/propostas) editadas fora do sync;
 *  - registros sem procedência verificada não entram nos dumps de produção.
 *
 * Uso: GITHUB_TOKEN=... node scripts/sync-discussao.mjs [--dry]
 * Requer repo público + Discussions (Q&A) com título = ID público.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseProposalBlock } from "./curadoria-sintese.mjs";
import {
  computeUniqueSupporters,
  isOfficialSourceCited,
  computeAuthorTier,
  defaultOfficialSources,
} from "../build/lib/mielina-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "ironidesflj";
const REPO = "noos-hub";
const DRY = process.argv.includes("--dry");
const IS_MAIN =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

const POSITIVE = new Set(["ROCKET", "THUMBS_UP", "HEART"]);

// ---------- pure helpers (exported para testes) ----------

export function parseQuestionTitle(title) {
  const m = /^([A-Z]{3})-([A-Z0-9]+)-(\d{5})$/.exec(String(title || "").trim());
  return m ? { prefix: m[1], id: m[0] } : null;
}

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
    explanation = text
      .replace(/^\*\*Alternativa que confundiu:\*\*.*$/gim, "")
      .replace(/^\*\*Status:\*\*.*$/gim, "")
      .replace(/^\*\*Fonte oficial:\*\*.*$/gim, "")
      .trim();
  }
  return {
    option: optMatch ? optMatch[1].toUpperCase() : "",
    passed: statusMatch ? /passei na prova|passed the exam/i.test(statusMatch[1]) : false,
    sourceUrl: srcMatch ? srcMatch[1] : "",
    explanation: explanation.replace(/\s+\n/g, "\n").trim(),
  };
}

/** Agrupa por título; a discussão mais antiga é canônica e as demais viram legacy. */
export function groupDiscussions(nodes) {
  const groups = new Map();
  for (const node of nodes || []) {
    const parsed = parseQuestionTitle(node.title);
    if (!parsed) continue;
    const list = groups.get(parsed.id) || [];
    list.push(node);
    groups.set(parsed.id, list);
  }
  const out = [];
  for (const [id, list] of groups) {
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const canonical = list[0];
    out.push({
      id,
      prefix: parseQuestionTitle(id).prefix,
      canonical,
      legacy: list.slice(1),
      discussions: list,
    });
  }
  return out;
}

export function mergeSynthesis(existingEntry) {
  const syn = existingEntry && typeof existingEntry.synthesis === "object" ? existingEntry.synthesis : null;
  if (!syn) return undefined;
  // Preserva o bloco inteiro (body/summary, revisions, pendingProposals):
  // o sync nunca é autoridade editorial.
  return JSON.parse(JSON.stringify(syn));
}

// ---------- GraphQL ----------

async function gql(token, query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const REACTION_FIELDS = `pageInfo{hasNextPage endCursor} nodes{content user{__typename login ... on User { id databaseId }}}`;
const COMMENT_FIELDS = `
  id url createdAt updatedAt isAnswer
  author { __typename login ... on User { id databaseId } }
  body
  reactions(first:100){${REACTION_FIELDS}}
`;
const REPLY_FIELDS = `
  id url createdAt updatedAt
  author { __typename login ... on User { id databaseId } }
  body
  reactions(first:100){${REACTION_FIELDS}}
`;

const Q_DISCUSSIONS = `
query($owner:String!, $name:String!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    discussions(first:50, after:$cursor, orderBy:{field:CREATED_AT, direction:ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number url title createdAt updatedAt
        author { __typename login ... on User { id databaseId } }
        body
        reactions(first:100){${REACTION_FIELDS}}
        comments(first:50){pageInfo{hasNextPage endCursor} nodes{${COMMENT_FIELDS}}}
      }
    }
  }
}`;

const Q_COMMENTS = `
query($id:ID!, $cursor:String) {
  node(id:$id) { ... on Discussion {
    comments(first:50, after:$cursor) { pageInfo{hasNextPage endCursor} nodes{${COMMENT_FIELDS}} }
  } }
}`;

const Q_REPLIES = `
query($id:ID!, $cursor:String) {
  node(id:$id) { ... on DiscussionComment {
    replies(first:50, after:$cursor) { pageInfo{hasNextPage endCursor} nodes{${REPLY_FIELDS}} }
  } }
}`;

const Q_REACTIONS = `
query($id:ID!, $cursor:String) {
  node(id:$id) {
    __typename
    ... on Discussion { reactions(first:100, after:$cursor){${REACTION_FIELDS}} }
    ... on DiscussionComment { reactions(first:100, after:$cursor){${REACTION_FIELDS}} }
  }
}`;

async function paginate(token, query, variables, pick) {
  let cursor = null;
  const all = [];
  for (;;) {
    const data = await gql(token, query, { ...variables, cursor });
    const conn = pick(data);
    if (!conn) throw new Error("conexão GraphQL ausente");
    all.push(...(conn.nodes || []));
    if (!conn.pageInfo.hasNextPage) return all;
    cursor = conn.pageInfo.endCursor;
  }
}

async function completeReactions(token, subjectId, firstConn) {
  const nodes = [...((firstConn && firstConn.nodes) || [])];
  if (!firstConn || !firstConn.pageInfo.hasNextPage) return nodes;
  let cursor = firstConn.pageInfo.endCursor;
  for (;;) {
    const data = await gql(token, Q_REACTIONS, { id: subjectId, cursor });
    const conn = data.node && data.node.reactions;
    if (!conn) throw new Error(`reações ausentes para ${subjectId}`);
    nodes.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) return nodes;
    cursor = conn.pageInfo.endCursor;
  }
}

async function completeReplies(token, commentId, firstConn) {
  const nodes = [...((firstConn && firstConn.nodes) || [])];
  if (firstConn && firstConn.pageInfo.hasNextPage) {
    let cursor = firstConn.pageInfo.endCursor;
    for (;;) {
      const data = await gql(token, Q_REPLIES, { id: commentId, cursor });
      const conn = data.node && data.node.replies;
      if (!conn) throw new Error(`respostas ausentes para ${commentId}`);
      nodes.push(...conn.nodes);
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
  }
  for (const reply of nodes) reply.reactions = { nodes: await completeReactions(token, reply.id, reply.reactions) };
  return nodes;
}

async function hydrateDiscussion(token, node) {
  const comments = [...node.comments.nodes];
  if (node.comments.pageInfo.hasNextPage) {
    // paginate() recomeça do cursor nulo para garantir a lista completa;
    // removemos duplicatas da primeira página pelo id estável.
    const all = await paginate(token, Q_COMMENTS, { id: node.id }, (d) => d.node.comments);
    const seen = new Set(node.comments.nodes.map((c) => c.id));
    comments.push(...all.filter((c) => !seen.has(c.id)));
  }
  for (const comment of comments) {
    comment.reactions = { nodes: await completeReactions(token, comment.id, comment.reactions) };
    comment.replies = { nodes: await completeReplies(token, comment.id, comment.replies) };
  }
  node.reactions = { nodes: await completeReactions(token, node.id, node.reactions) };
  node.comments = { nodes: comments };
  return node;
}

// ---------- normalização ----------

function normalizeContribution(node, { discussion, prefix, allowlist, isRoot }) {
  const author = node.author || {};
  if (!author.id) return null;
  if (!node.id || !/^D[CR]?_/.test(String(node.id))) return null;
  if (!node.url || !String(node.url).startsWith("https://github.com/")) return null;
  const parsed = parseStructured(node.body);
  const supporters = computeUniqueSupporters(node.reactions?.nodes || [], author.id);
  return {
    subjectId: node.id,
    subjectType: isRoot ? "Discussion" : "DiscussionComment",
    discussionId: discussion.id,
    url: node.url,
    parentSubjectId: isRoot ? null : null,
    authorId: author.id,
    handle: author.login ? `@${author.login}` : "",
    tier: 1,
    passedSelfDeclared: parsed.passed,
    option: parsed.option,
    body: parsed.explanation,
    sourceUrl: parsed.sourceUrl,
    sourceOfficial: parsed.sourceUrl ? isOfficialSourceCited(parsed.sourceUrl, prefix, allowlist) : false,
    accelerations: supporters.size,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt || node.createdAt,
    isRoot: Boolean(isRoot),
    replyToSubjectId: null,
  };
}

export function collectContributions(group, allowlist) {
  const out = [];
  const proposals = [];
  for (const discussion of group.discussions) {
    const root = normalizeContribution(discussion, {
      discussion,
      prefix: group.prefix,
      allowlist,
      isRoot: true,
    });
    if (root) out.push(root);
    for (const comment of discussion.comments.nodes) {
      const proposal = parseProposalBlock(comment.body || "");
      if (proposal.ok) {
        const author = comment.author || {};
        if (author.id && comment.id && String(comment.url || "").startsWith("https://github.com/")) {
          proposals.push({
            proposalId: comment.id,
            baseVersion: proposal.value.baseVersion,
            proposerId: author.id,
            proposerHandle: author.login ? `@${author.login}` : "",
            body: proposal.value.body,
            sourceUrl: proposal.value.sourceUrl,
            contentHash: proposal.value.contentHash,
            createdAt: comment.createdAt,
          });
        }
        continue;
      }
      const normalized = normalizeContribution(comment, {
        discussion,
        prefix: group.prefix,
        allowlist,
        isRoot: false,
      });
      if (normalized) out.push(normalized);
      for (const reply of comment.replies?.nodes || []) {
        const normalizedReply = normalizeContribution(reply, {
          discussion,
          prefix: group.prefix,
          allowlist,
          isRoot: false,
        });
        if (normalizedReply) {
          normalizedReply.parentSubjectId = comment.id;
          normalizedReply.replyToSubjectId = comment.id;
          out.push(normalizedReply);
        }
      }
    }
  }
  // dedupe por subjectId (discussões legadas podem repetir)
  const byId = new Map();
  for (const c of out) if (!byId.has(c.subjectId)) byId.set(c.subjectId, c);
  return {
    comments: [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    proposals,
  };
}

// ---------- reputação ----------

export function buildAuthorMetrics(entries, preserved, curators) {
  const stats = new Map();
  const touch = (authorId, handle) => {
    if (!stats.has(authorId)) {
      stats.set(authorId, {
        authorId,
        handle,
        participations: new Set(),
        eligibleSupports: 0,
        officialPosts: new Set(),
        selfDeclaredPassed: false,
        lastContributionAt: null,
      });
    }
    return stats.get(authorId);
  };
  for (const entry of entries) {
    for (const c of entry.comments) {
      const s = touch(c.authorId, c.handle);
      s.participations.add(c.subjectId);
      s.eligibleSupports += Number(c.accelerations) || 0;
      if (c.sourceOfficial) s.officialPosts.add(c.subjectId);
      if (c.passedSelfDeclared) s.selfDeclaredPassed = true;
      if (!s.lastContributionAt || new Date(c.createdAt) > new Date(s.lastContributionAt)) s.lastContributionAt = c.createdAt;
    }
    // sínteses aprovadas distintas: contribuinte/propositor/aprovador no bloco preservado
    const syn = preserved.get(entry.id)?.synthesis;
    if (syn) {
      const contributors = Array.isArray(syn.contributors) ? syn.contributors : [];
      const revisions = Array.isArray(syn.revisions) ? syn.revisions : [];
      for (const c of entry.comments) {
        const handles = contributors.map((x) => (typeof x === "string" ? x : x?.handle)).filter(Boolean);
        const ids = contributors.map((x) => (typeof x === "object" ? x?.authorId : null)).filter(Boolean);
        const revisionIds = revisions.flatMap((r) => [r.proposerId, r.approverId]).filter(Boolean);
        if (ids.includes(c.authorId) || handles.includes(c.handle) || revisionIds.includes(c.authorId)) {
          const s = touch(c.authorId, c.handle);
          s.approvedSyntheses = (s.approvedSyntheses || new Set()).add(entry.id);
        }
      }
    }
  }
  const curatorIds = new Set((curators || []).map((c) => c.authorId));
  const authors = {};
  for (const s of stats.values()) {
    const metrics = {
      authenticatedParticipations: s.participations.size,
      eligibleSupports: s.eligibleSupports,
      officialCitedPosts: s.officialPosts.size,
      selfDeclaredPassed: s.selfDeclaredPassed,
      distinctApprovedSyntheses: s.approvedSyntheses ? s.approvedSyntheses.size : 0,
    };
    authors[s.authorId] = {
      handle: s.handle,
      tier: computeAuthorTier(metrics, { isCurator: curatorIds.has(s.authorId) }),
      selfDeclaredPassed: s.selfDeclaredPassed,
      metrics,
      lastContributionAt: s.lastContributionAt,
    };
  }
  return authors;
}

// ---------- coleta ----------

async function collectAll(token) {
  const discussions = await paginate(
    token,
    Q_DISCUSSIONS,
    { owner: OWNER, name: REPO },
    (d) => d.repository.discussions
  );
  for (const discussion of discussions) await hydrateDiscussion(token, discussion);
  return discussions;
}

function readJson(rel, fallback) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJsonAtomic(rel, data) {
  const file = path.join(ROOT, rel);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
  console.log(`wrote ${rel}`);
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!token) throw new Error("GITHUB_TOKEN ausente");

  const allowlist = readJson("discussao/official-sources.json", defaultOfficialSources());
  const prevReputation = readJson("discussao/reputation.json", {
    curators: [{ authorId: "U_kgDOCouteg", handle: "@ironidesflj", role: "maintainer-curator" }],
    authors: {},
    verifiedOfficialUrls: [],
  });
  const curators = Array.isArray(prevReputation.curators) && prevReputation.curators.length
    ? prevReputation.curators
    : [{ authorId: "U_kgDOCouteg", handle: "@ironidesflj", role: "maintainer-curator" }];

  const raw = await collectAll(token); // lança em qualquer falha → nada é escrito
  const groups = groupDiscussions(raw);

  const previousByPrefix = new Map();
  for (const prefix of ["RAN", "SYN", "MYE", "THA", "ENG"]) {
    previousByPrefix.set(prefix, readJson(`discussao/${prefix}.json`, {}));
  }

  const syncedAt = new Date().toISOString();
  const entriesByPrefix = new Map();
  const allEntries = [];
  for (const group of groups) {
    const entries = entriesByPrefix.get(group.prefix) || {};
    const collected = collectContributions(group, allowlist);
    const comments = collected.comments;
    const passedAuthors = new Set(comments.filter((c) => c.passedSelfDeclared).map((c) => c.authorId));
    const prev = previousByPrefix.get(group.prefix)?.[group.id];
    const preservedSynthesis = mergeSynthesis(prev);
    const approvedIds = new Set(
      (preservedSynthesis?.revisions || []).map((r) => r.originCommentId).filter(Boolean)
    );
    const pending = collected.proposals.filter((p) => !approvedIds.has(p.proposalId));
    // Proposta só existe sobre síntese existente (a API exige SYNTHESIS_MISSING
    // para propor em questão sem síntese). Sem síntese preservada, não inventamos
    // um bloco só para pendências.
    const synthesis = preservedSynthesis ? { ...preservedSynthesis, pendingProposals: pending } : undefined;
    const entry = {
      discussionId: group.canonical.id,
      discussionNumber: group.canonical.number,
      discussionUrl: group.canonical.url,
      legacyDiscussionIds: group.legacy.map((d) => d.id),
      legacyDiscussionNumbers: group.legacy.map((d) => d.number),
      syncedAt,
      approvedPassersCount: passedAuthors.size,
      ...(synthesis ? { synthesis } : {}),
      comments,
    };
    entries[group.id] = entry;
    entriesByPrefix.set(group.prefix, entries);
    allEntries.push(entry);
  }

  const authors = buildAuthorMetrics(allEntries, new Map(groups.map((g) => [g.id, previousByPrefix.get(g.prefix)?.[g.id] || {}])), curators);
  for (const entry of allEntries) {
    for (const c of entry.comments) {
      const a = authors[c.authorId];
      if (a) c.tier = a.tier;
    }
  }

  const verifiedOfficialUrls = new Set(
    Array.isArray(prevReputation.verifiedOfficialUrls) ? prevReputation.verifiedOfficialUrls : []
  );
  for (const entry of allEntries) for (const c of entry.comments) if (c.sourceOfficial && c.sourceUrl) verifiedOfficialUrls.add(c.sourceUrl);

  const reputation = {
    syncedAt,
    curators,
    authors,
    verifiedOfficialUrls: [...verifiedOfficialUrls].sort(),
  };

  if (DRY) {
    console.log(`[dry] ${allEntries.length} questões; ${Object.keys(authors).length} autores`);
    return;
  }

  // all-or-nothing: só escreve depois de toda a coleta/validação concluída
  for (const [prefix, entries] of [...entriesByPrefix.entries()].sort()) {
    const ordered = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
    writeJsonAtomic(`discussao/${prefix}.json`, ordered);
  }
  writeJsonAtomic("discussao/reputation.json", reputation);
  console.log(`sync ok: ${allEntries.length} questões, ${Object.keys(authors).length} autores, ${verifiedOfficialUrls.size} fontes oficiais`);
}

if (IS_MAIN) {
  main().catch((error) => {
    console.error(`sync abortado (nenhum arquivo alterado): ${error.message}`);
    process.exit(1);
  });
}
