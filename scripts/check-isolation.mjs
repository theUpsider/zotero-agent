/** Zotero-global isolation check (S2-01, component view §3).
 *
 * Only `src/zotero/` may touch the Zotero runtime globals so every other
 * module stays unit-testable without a Zotero instance. `src/plugin.ts` is
 * allowlisted as the composition root: it is thin window/lifecycle glue that
 * wires the dependency graph and registers panes/menus (documented in
 * CLAUDE.md and the component view).
 *
 * Scans src/**\/*.ts for runtime references to `Zotero.` / `Services.` with
 * comments stripped (doc comments may mention the globals). Exits non-zero
 * and prints offending file:line pairs on violation.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const SRC_ROOT = new URL("../src", import.meta.url).pathname;
const GLOBAL_PATTERN = /\b(?:Zotero|Services)\./;
const ALLOWED = [`zotero${sep}`, "plugin.ts"];

function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

/** Blank out // and /* *\/ comments while preserving line numbers. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, prefix) => prefix + " ".repeat(m.length - prefix.length));
}

const violations = [];
for (const file of collectTsFiles(SRC_ROOT)) {
  const rel = relative(SRC_ROOT, file);
  if (ALLOWED.some((prefix) => rel.startsWith(prefix))) continue;
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    if (GLOBAL_PATTERN.test(line)) {
      violations.push(`src/${rel}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("Zotero-global isolation violated (only src/zotero/ and src/plugin.ts may touch Zotero/Services):");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("check:isolation OK — no Zotero/Services references outside src/zotero/ and src/plugin.ts");
