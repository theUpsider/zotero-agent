/** AI provider abstraction (EIR-012): all providers — OpenAI-compatible,
 * local models, future Codex/Copilot — sit behind this interface so
 * workflows never depend on a concrete provider (NFR-026). */

export interface ProviderConfig {
  /** Provider id, e.g. "openai-compatible" or "local". */
  id: string;
  endpoint: string;
  model: string;
  /** Credential reference; actual secret storage is handled separately (DAR-008). */
  apiKeyRef?: string;
}

export interface CompletionRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
}

export interface AIProvider {
  readonly id: string;
  /** Validate configuration before running a workflow (FR-020). */
  validateConfig(config: ProviderConfig): Promise<{ ok: boolean; message?: string }>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
