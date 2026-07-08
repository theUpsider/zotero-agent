/**
 * Build script.
 *   node scripts/build.mjs           one-shot build into build/addon/
 *   node scripts/build.mjs --watch   rebuild on change (load build/addon/ via
 *                                    Zotero source-proxy, see README)
 *   node scripts/build.mjs --pack    build + zip build/addon/ into a .xpi
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "build", "addon");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const watch = process.argv.includes("--watch");
const pack = process.argv.includes("--pack");

function copyStaticFiles() {
  cpSync(join(root, "addon"), outDir, { recursive: true });
  // Stamp the package version into the manifest.
  const manifestPath = join(outDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const buildOptions = {
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(outDir, "content", "zotero-agent.js"),
  bundle: true,
  format: "iife",
  globalName: "ZoteroAgent",
  target: "firefox115",
  sourcemap: "inline",
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version) },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyStaticFiles();

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log(`watching src/ — output: ${outDir}`);
} else {
  await esbuild.build(buildOptions);
  console.log(`built ${outDir}`);
  if (pack) {
    const xpi = join(root, "build", `zotero-agent-${pkg.version}.xpi`);
    rmSync(xpi, { force: true });
    // Files must sit at the archive root (research guide §3.7).
    execFileSync("zip", ["-r", xpi, "."], { cwd: outDir, stdio: "inherit" });
    console.log(`packed ${xpi}`);
  }
}
