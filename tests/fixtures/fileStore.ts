/** In-memory FileStore fake (S3-01/S3-02 tests) — no disk I/O. */

import type { FileStore } from "../../src/zotero/types";

export function createFakeFileStore(): FileStore {
  const files = new Map<string, string | Uint8Array>();
  return {
    async readText(name) {
      const value = files.get(name);
      return typeof value === "string" ? value : null;
    },
    async writeText(name, text) {
      files.set(name, text);
    },
    async readBytes(name) {
      const value = files.get(name);
      return value instanceof Uint8Array ? value : null;
    },
    async writeBytes(name, bytes) {
      files.set(name, bytes);
    },
    async remove(name) {
      files.delete(name);
    },
  };
}
