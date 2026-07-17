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
  /** Nucleus sampling probability (0–1). Omitted from the request when
   * undefined, so the provider default applies. */
  topP?: number;
  signal?: AbortSignal;
  /** OpenAI structured outputs (https://platform.openai.com/docs/guides/structured-outputs).
   * When set, the provider sends `response_format` in the request body so the
   * model is constrained to produce valid JSON matching the schema. */
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
}

export interface CompletionResult {
  text: string;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** True when the reply was cut off at the completion-token limit
   * (finish_reason "length"); callers can shrink the request and retry. */
  truncated?: boolean;
}

/** Optional model metadata exposed by provider discovery endpoints. Providers
 * that do not report a context size simply omit this capability. */
export interface ModelCapabilities {
  contextWindowTokens?: number;
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
  complete(
    request: CompletionRequest,
    onChunk?: ChunkHandler,
  ): Promise<CompletionResult>;
  listModels?(): Promise<string[]>;
  /** Capabilities for the currently configured model. Optional so existing
   * providers and listModels() implementations remain source-compatible. */
  getModelCapabilities?(): Promise<ModelCapabilities | undefined>;
}

/** Injectable HTTP seam: tests use fakes (no live HTTP), runtime injects the
 * environment's fetch (resolved in src/zotero/http.ts). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderDeps {
  fetch: FetchLike;
  logger: Logger;
  /** Defaults to the global AbortController; runtime overrides this when the
   * host scope has none (resolved in src/zotero/http.ts). */
  createAbortController?: () => AbortController;
}
