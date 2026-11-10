/**
 * Discussion layer data contract (F2.1 — static dumps).
 * File: discussao/{PREFIX}.json (production) or build/fixtures/discussao.json (QA).
 * Shape: { "<PUBLIC_ID>": { synthesis?: {...}, comments?: [...] } }
 * Everything is untrusted text: the caller escapes before rendering.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadDiscussao(root, prefix, qa = false) {
  const file = qa
    ? path.join(root, "build", "fixtures", "discussao.json")
    : path.join(root, "discussao", `${prefix}.json`);
  if (!existsSync(file)) return { byId: new Map(), source: null };
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const byId = new Map();
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    byId.set(id, entry);
  }
  return { byId, source: path.basename(file) };
}
