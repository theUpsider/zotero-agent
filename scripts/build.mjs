/**
 * Build script.
 *   node scripts/build.mjs           one-shot build into build/addon/
 *   node scripts/build.mjs --watch   rebuild on change (load build/addon/ via
 *                                    Zotero source-proxy, see README)
 *   node scripts/build.mjs --pack    build + zip build/addon/ into a .xpi
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** onnxruntime-web's wasm binaries (bundled inside @huggingface/transformers'
 * own dist/) can't be esbuild-bundled into the IIFE — they're loaded at
 * runtime by URL. Copy them next to the bundle so the embedder can point
 * `env.backends.onnx.wasm.wasmPaths` at a local, offline path (S3-03). Silent
 * no-op when the dependency isn't installed (embeddings stay optional). */
function copyOnnxWasmAssets() {
  const wasmSrcDir = join(root, "node_modules", "@huggingface", "transformers", "dist");
  if (!existsSync(wasmSrcDir)) return;
  const wasmDestDir = join(outDir, "content", "ort");
  mkdirSync(wasmDestDir, { recursive: true });
  for (const name of readdirSync(wasmSrcDir)) {
    if (name.endsWith(".wasm")) cpSync(join(wasmSrcDir, name), join(wasmDestDir, name));
  }
}

const buildOptions = {
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(outDir, "content", "zotero-agent.js"),
  bundle: true,
  format: "iife",
  globalName: "ZoteroAgent",
  platform: "browser",
  target: "firefox115",
  sourcemap: "inline",
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version) },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyStaticFiles();
copyOnnxWasmAssets();

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
