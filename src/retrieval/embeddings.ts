/** Local embedding generation (S3-03; FR-068, FR-072, NFR-007, NFR-010).
 *
 * `Embedder` is the only contract the backend depends on, so semantic/hybrid
 * retrieval works with any implementation. This module never imports
 * providers/ — embeddings are computed and consumed entirely inside
 * retrieval/, never sent anywhere (enforced structurally by the import
 * matrix, scripts/check-isolation.mjs).
 *
 * `createTransformersEmbedder` wraps transformers.js (ONNX/wasm,
 * all-MiniLM-L6-v2, 384-dim) per the S2-09 decision
 * (docs/research/retrieval-library-decision.md). Wasm instantiation inside
 * Firefox 115's privileged chrome scope is UNVERIFIED — that is the explicit
 * day-1 probe gate for S3-03 (see ./probe.ts). Until a probe run confirms it,
 * the `retrieval.embeddings` pref defaults to false and retrieval runs
 * keyword-only; this implementation exists so enabling it later is a
 * pref flip, not new code. */

export interface Embedder {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Duck-typed subset of the Web Cache API that transformers.js requires for
 * `env.customCache` (see src/zotero/modelCache.ts for the real
 * implementation). Kept structural here so embeddings.ts needs no import
 * from zotero/ beyond what every retrieval/ module is already allowed. */
export interface ModelCacheLike {
  match(request: string | { url: string }): Promise<Response | undefined>;
  put(request: string | { url: string }, response: Response): Promise<void>;
}

export interface TransformersEmbedderOptions {
  /** URL (including trailing slash) where the copied onnxruntime-web wasm
   * binaries live, e.g. `${rootURI}content/ort/` (see scripts/build.mjs). */
  wasmPaths: string;
  customCache: ModelCacheLike;
  onWarning?: (message: string) => void;
}

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_LABEL = "all-MiniLM-L6-v2";
const DIM = 384;

/** Returns null on any failure (wasm unavailable, model download failed,
 * offline first run, …) — callers degrade to keyword-only retrieval, never
 * throw (S3-03 AC: "embedding failures degrade gracefully"). */
export async function createTransformersEmbedder(
  options: TransformersEmbedderOptions,
): Promise<Embedder | null> {
  try {
    // Dynamic import: this dependency is only ever loaded when embeddings
    // are enabled, keeping the keyword-only path free of any wasm/model cost.
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = options.customCache;
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = options.wasmPaths;
      env.backends.onnx.wasm.numThreads = 1;
    }

    const extractor = await pipeline("feature-extraction", MODEL_ID);

    return {
      model: MODEL_LABEL,
      dim: DIM,
      async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        const output = await extractor(texts, { pooling: "mean", normalize: true });
        const data = output.data as Float32Array;
        return texts.map((_, i) => data.slice(i * DIM, (i + 1) * DIM));
      },
    };
  } catch (error) {
    options.onWarning?.(
      `local embeddings unavailable (${error instanceof Error ? error.message : String(error)}); retrieval will run keyword-only`,
    );
    return null;
  }
}

/** Deterministic, dependency-free embedder for unit tests and as a
 * structural proof that semantic/hybrid modes work with any Embedder
 * implementation — not semantically meaningful, but cosine-consistent
 * (similar strings produce similar vectors), which is all the contract
 * tests need. */
export function createFakeEmbedder(dim = 32): Embedder {
  return {
    model: "fake-hash-embedder",
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((text) => hashEmbed(text, dim));
    },
  };
}

function hashEmbed(text: string, dim: number): Float32Array {
  const vector = new Float32Array(dim);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    let hash = 0;
    for (let c = 0; c < bigram.length; c++) hash = (Math.imul(hash, 31) + bigram.charCodeAt(c)) >>> 0;
    const bucket = hash % dim;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  let normSquared = 0;
  for (let i = 0; i < dim; i++) normSquared += vector[i]! * vector[i]!;
  const norm = Math.sqrt(normSquared) || 1;
  for (let i = 0; i < dim; i++) vector[i] = vector[i]! / norm;
  return vector;
}
