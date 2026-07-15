/** Web-Cache-API-shaped cache for transformers.js model downloads (S3-03),
 * backed by the plugin data dir via FileStore so the ~25MB embedding model is
 * fetched once and reused fully offline afterwards. This is a *model*
 * download (library code, not user library content) — distinct from the
 * NFR-010 boundary on embeddings/user text, which this cache never touches.
 * transformers.js requires an object implementing exactly `match`/`put` from
 * the Web Cache API (see @huggingface/transformers src/utils/hub.js). */

import type { Logger } from "../core/errors";
import { resolveWebGlobal } from "./http";
import type { FileStore } from "./types";

export interface ModelCache {
  match(request: string | { url: string }): Promise<Response | undefined>;
  put(request: string | { url: string }, response: Response): Promise<void>;
}

function urlToFileName(url: string): string {
  // Model URLs are long and contain slashes/query strings; a filesystem-safe
  // encoding keyed by the whole URL avoids any need to parse hub paths.
  return `models/${encodeURIComponent(url)}.bin`;
}

export function createModelCache(fileStore: FileStore, logger: Logger): ModelCache {
  // Resolved once: the bootstrap sandbox has no global Response/Blob (same
  // gap as fetch/AbortController — see zotero/http.ts), so without the
  // main-window fallback every cache read would silently miss and the model
  // would re-download on every session.
  const ResponseCtor = resolveWebGlobal<typeof Response>("Response");
  const BlobCtor = resolveWebGlobal<typeof Blob>("Blob");
  return {
    async match(request) {
      const url = typeof request === "string" ? request : request.url;
      if (!ResponseCtor || !BlobCtor) {
        logger.error(`model cache read failed for ${url}: Response/Blob unavailable`);
        return undefined;
      }
      try {
        const bytes = await fileStore.readBytes(urlToFileName(url));
        if (!bytes) return undefined;
        const owned = new Uint8Array(new ArrayBuffer(bytes.byteLength));
        owned.set(bytes);
        return new ResponseCtor(new BlobCtor([owned]));
      } catch (error) {
        logger.error(`model cache read failed for ${url}`, error);
        return undefined;
      }
    },

    async put(request, response) {
      const url = typeof request === "string" ? request : request.url;
      try {
        const bytes = new Uint8Array(await response.clone().arrayBuffer());
        await fileStore.writeBytes(urlToFileName(url), bytes);
      } catch (error) {
        // A failed cache write must not fail the model load itself — worst
        // case the model re-downloads next session (S3-03 degradation path).
        logger.error(`model cache write failed for ${url}`, error);
      }
    },
  };
}
