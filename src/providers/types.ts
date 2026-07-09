/** Provider abstraction (S1-01, EIR-007, EIR-012, NFR-026). Providers are
 * Zotero-free: HTTP and logging are injected. Workflows and UI depend only on
 * these types, never on concrete provider classes. */

import type { AgentError, Logger } from "../core/errors";

/** Resolved provider settings. The apiKey is the actual secret, resolved by
 * the provider gate from the CredentialStore — providers never see where it
 * was stored (DAR-008). */
export interface ProviderSettings {
  id: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Streaming-ready request shape (S1-01): cancellation via signal now,
 * chunked delivery via ChunkHandler later. */
export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/** Sprint 1 providers may buffer and emit a single chunk; the signature is
 * ready for SSE streaming without interface changes. */
export type ChunkHandler = (chunk: { text: string }) => void;

export type ValidationResult =
  | { ok: true; message: string; models?: string[] }
  | { ok: false; error: AgentError };

export interface AIProvider {
  readonly id: string;
  /** Plain-language name for the settings dropdown (NFR-013). */
  readonly label: string;
  /** Live check: configured, endpoint reachable, auth accepted, model known
   * (FR-020). Never throws — failures come back as typed errors. */
  validateConfig(): Promise<ValidationResult>;
  complete(request: CompletionRequest, onChunk?: ChunkHandler): Promise<CompletionResult>;
  listModels?(): Promise<string[]>;
}

/** Injectable HTTP seam: tests use fakes (no live HTTP), runtime injects the
 * environment's fetch (resolved in src/zotero/http.ts). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderDeps {
  fetch: FetchLike;
  logger: Logger;
}
