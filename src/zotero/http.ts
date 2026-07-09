/** Resolve a FetchLike for the runtime environment (S1-03 transport seam).
 * The esbuild bundle runs in the bootstrap sandbox, which may not expose a
 * global fetch — fall back to a main-window fetch. Providers never call fetch
 * directly; they receive this via dependency injection. */

import type { FetchLike } from "../providers/types";
import { ProviderUnavailableError } from "../core/errors";

export function resolveFetch(): FetchLike {
  const sandboxFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof sandboxFetch === "function") {
    return sandboxFetch.bind(globalThis) as FetchLike;
  }
  return (url, init) => {
    const win = Zotero.getMainWindow() as (Window & { fetch?: FetchLike }) | null;
    if (!win || typeof win.fetch !== "function") {
      throw new ProviderUnavailableError(
        "Could not reach the AI service. Check the endpoint URL and your internet connection.",
      );
    }
    return win.fetch(url, init);
  };
}
