/** Resolve web-platform globals for the runtime environment (S1-03 transport
 * seam). The esbuild bundle runs in the bootstrap sandbox, which — unlike a
 * regular window — is a bare Sandbox and exposes only what Gecko's bootstrap
 * loader explicitly grants (Zotero, Services, Cc/Ci/Cu); ordinary Web API
 * constructors (fetch, AbortController, Response, Blob, ...) are absent
 * there even though the bundle's TypeScript types assume they're ambient.
 * Every caller falls back to the last-focused main window's copy. Modules
 * outside src/zotero/ never touch these directly; they receive resolved
 * instances via dependency injection. */

import type { FetchLike } from "../providers/types";
import { ProviderUnavailableError } from "../core/errors";

/** Look up a constructor/function-valued global, sandbox first, then the
 * main window. Returns undefined rather than throwing — callers decide
 * whether the global is essential (throw) or gracefully degradable (skip). */
export function resolveWebGlobal<T>(name: string): T | undefined {
  const sandboxValue = (globalThis as Record<string, unknown>)[name];
  if (typeof sandboxValue === "function") return sandboxValue as T;
  const win = Zotero.getMainWindow() as (Window & Record<string, unknown>) | null;
  const windowValue = win ? win[name] : undefined;
  return typeof windowValue === "function" ? (windowValue as T) : undefined;
}

function requireWebGlobal<T>(name: string): T {
  const value = resolveWebGlobal<T>(name);
  if (!value) {
    throw new ProviderUnavailableError(
      "Could not reach the AI service. Check the endpoint URL and your internet connection.",
    );
  }
  return value;
}

export function resolveFetch(): FetchLike {
  const sandboxFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof sandboxFetch === "function") {
    return sandboxFetch.bind(globalThis) as FetchLike;
  }
  return (url, init) => requireWebGlobal<FetchLike>("fetch")(url, init);
}

/** The bootstrap sandbox has no global AbortController either — same fallback
 * as resolveFetch, so request timeouts (S1-03) work from that scope too. */
export function resolveAbortController(): () => AbortController {
  return () => new (requireWebGlobal<typeof AbortController>("AbortController"))();
}
