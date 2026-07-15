/** Plugin-data-directory file store (S3-01, S3-03; DAR-003/004). Backs the
 * FileStore seam declared in ./types so retrieval/ never touches the Zotero
 * global directly. Writes are atomic (write to a .tmp path, then move) so a
 * crash mid-write can never leave a half-written snapshot behind — the
 * previous snapshot (or nothing) survives, and the index is a rebuildable
 * cache either way (BR-009). */

import type { Logger } from "../core/errors";
import type { FileStore } from "./types";

const SUBDIR = "zotero-agent";

async function ensureDir(dir: string): Promise<void> {
  await IOUtils.makeDirectory(dir, { ignoreExisting: true, createAncestors: true });
}

export function createPluginFileStore(logger: Logger): FileStore {
  const dir = PathUtils.join(Zotero.DataDirectory.dir, SUBDIR);
  const dirReady = ensureDir(dir).catch((error) => {
    logger.error(`could not create plugin data directory ${dir}`, error);
  });
  const path = (name: string) => PathUtils.join(dir, name);

  async function atomicWrite(name: string, write: (tmpPath: string) => Promise<unknown>): Promise<void> {
    await dirReady;
    const tmpPath = path(`${name}.tmp`);
    await write(tmpPath);
    await IOUtils.move(tmpPath, path(name));
  }

  return {
    async readText(name) {
      await dirReady;
      try {
        return await IOUtils.readUTF8(path(name));
      } catch {
        return null;
      }
    },

    async writeText(name, text) {
      await atomicWrite(name, (tmpPath) => IOUtils.writeUTF8(tmpPath, text));
    },

    async readBytes(name) {
      await dirReady;
      try {
        return await IOUtils.read(path(name));
      } catch {
        return null;
      }
    },

    async writeBytes(name, bytes) {
      await atomicWrite(name, (tmpPath) => IOUtils.write(tmpPath, bytes));
    },

    async remove(name) {
      await dirReady;
      await IOUtils.remove(path(name), { ignoreAbsent: true });
    },
  };
}
