/** Day-1 runtime probe (S3-03 gate; per docs/research/retrieval-library-decision.md).
 * Wasm instantiation for onnxruntime-web inside Firefox 115's privileged
 * chrome scope is unverified — this is the timeboxed check that decides
 * whether `retrieval.embeddings` can default to on. Exposed as a dev-only
 * hook (`Zotero.ZoteroAgent.dev.probeRetrieval()`, see plugin.ts) so it can
 * be run once from the Run-JavaScript console; never invoked automatically. */

import { createOramaBackend } from "./oramaBackend";
import { createTransformersEmbedder, type ModelCacheLike } from "./embeddings";

export interface ProbeReport {
  /** onnxruntime-web wasm loaded and a MiniLM embedding pipeline initialized. */
  wasmOk: boolean;
  /** The embedder produced a vector of the expected dimensionality. */
  embedOk: boolean;
  dim?: number;
  /** Orama create/insert/search round-trip (expected to always pass — pure JS). */
  oramaOk: boolean;
  elapsedMs: number;
  error?: string;
}

export interface ProbeOptions {
  wasmPaths: string;
  customCache: ModelCacheLike;
}

async function probeOrama(): Promise<boolean> {
  try {
    const backend = createOramaBackend();
    await backend.indexItem("PROBE", [
      { itemKey: "PROBE", source: "metadata", text: "retrieval probe content", chunkId: "PROBE:metadata:0" },
    ]);
    const results = await backend.query({ text: "probe", mode: "keyword" });
    return results.length > 0;
  } catch {
    return false;
  }
}

export async function runRetrievalProbe(options: ProbeOptions): Promise<ProbeReport> {
  const start = Date.now();
  const oramaOk = await probeOrama();
  try {
    const embedder = await createTransformersEmbedder({
      wasmPaths: options.wasmPaths,
      customCache: options.customCache,
    });
    if (!embedder) {
      return { wasmOk: false, embedOk: false, oramaOk, elapsedMs: Date.now() - start, error: "embedder init returned null" };
    }
    const [vector] = await embedder.embed(["hello world"]);
    return {
      wasmOk: true,
      embedOk: vector?.length === embedder.dim,
      dim: embedder.dim,
      oramaOk,
      elapsedMs: Date.now() - start,
    };
  } catch (error) {
    return {
      wasmOk: false,
      embedOk: false,
      oramaOk,
      elapsedMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
