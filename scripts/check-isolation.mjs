/** Zotero-global isolation check (S2-01, component view §3) plus the
 * inter-module import matrix (S3-01, component view §3 dependency table).
 *
 * Only `src/zotero/` may touch the Zotero runtime globals so every other
 * module stays unit-testable without a Zotero instance. `src/plugin.ts` is
 * allowlisted as the composition root: it is thin window/lifecycle glue that
 * wires the dependency graph and registers panes/menus (documented in
 * CLAUDE.md and the component view).
 *
 * The import-matrix pass enforces the module boundaries that make the
 * embeddings/index data physically unable to reach a network provider
 * (NFR-010) and keep providers/retrieval mutually invisible (EIR-017):
 *   retrieval/  -> only core/, zotero/types (types-only), itself
 *   providers/  -> never retrieval/
 *   prompts/    -> never providers/, workflows/
 *   ui/         -> never providers/ (must go through workflows/ gate)
 *
 * Scans src/**\/*.ts for runtime references to `Zotero.` / `Services.` and
 * for `import ... from "..."` lines, with comments stripped (doc comments may
 * mention the globals). Exits non-zero and prints offending file:line pairs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
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

// --- Import matrix -------------------------------------------------------

const IMPORT_PATTERN = /^\s*import\s+(?:type\s+)?(?:[^"'{]*from\s+)?["']([^"']+)["']/;

function moduleDir(rel) {
  return rel.split(sep)[0];
}

/** rule: [moduleDir, forbiddenTargetDir, exceptionPredicate?] */
const RULES = [
  {
    from: "retrieval",
    forbidden: ["providers", "workflows", "prompts", "ui"],
    reason: "retrieval/ must stay reachable from neither the network provider nor the UI/workflow layers (NFR-010, EIR-017)",
  },
  {
    from: "retrieval",
    forbidden: ["zotero"],
    // Types-only imports (import type { X } from "../zotero/types") are the
    // one permitted seam — retrieval needs FileStore/ItemContext shapes.
    exceptFile: "types",
    reason: "retrieval/ may only import plain types from zotero/types, never adapter/notifier code",
  },
  {
    from: "providers",
    forbidden: ["retrieval"],
    reason: "providers/ must never see index/embedding data (NFR-010)",
  },
  {
    from: "prompts",
    forbidden: ["providers", "workflows"],
    reason: "prompts/ stays a pure composer; provider calls happen only in workflows/",
  },
  {
    from: "ui",
    forbidden: ["providers"],
    reason: "ui/ may only reach providers through the workflows/ gate (providerGate.ts)",
  },
];

const importViolations = [];
for (const file of collectTsFiles(SRC_ROOT)) {
  const rel = relative(SRC_ROOT, file);
  const dir = moduleDir(rel);
  const applicableRules = RULES.filter((r) => r.from === dir);
  if (applicableRules.length === 0) continue;

  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const match = IMPORT_PATTERN.exec(line);
    if (!match) return;
    const specifier = match[1];
    if (!specifier.startsWith(".")) return;
    // Resolve relative to the importing file's directory, in src-relative terms.
    const fileDir = dirname(join(SRC_ROOT, rel));
    const targetPath = join(fileDir, specifier);
    const targetRel = relative(SRC_ROOT, targetPath);
    const targetDir = targetRel.split(sep)[0];
    const targetLeaf = targetRel.split(sep).pop();

    for (const rule of applicableRules) {
      if (!rule.forbidden.includes(targetDir)) continue;
      if (rule.exceptFile && targetLeaf === rule.exceptFile) continue;
      importViolations.push(
        `src/${rel}:${index + 1}: '${dir}/' importing from '${targetDir}/' — ${rule.reason}`,
      );
    }
  });
}

if (importViolations.length > 0) {
  console.error("Module import matrix violated:");
  for (const violation of importViolations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("check:isolation OK — import matrix respected (retrieval/providers/prompts/ui boundaries)");
