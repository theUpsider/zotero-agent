import type { AIProvider, CompletionRequest, CompletionResult, ProviderConfig } from "./types";

/** OpenAI-compatible endpoint provider (FR-013, FR-017, EIR-008).
 * Skeleton: request wiring comes with the provider milestone. */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id = "openai-compatible";

  constructor(private readonly config: ProviderConfig) {}

  async validateConfig(config: ProviderConfig): Promise<{ ok: boolean; message?: string }> {
    if (!config.endpoint.trim()) return { ok: false, message: "Endpoint URL is not configured." };
    if (!config.model.trim()) return { ok: false, message: "Model identifier is not configured." };
    return { ok: true };
  }

  async complete(_request: CompletionRequest): Promise<CompletionResult> {
    throw new Error("Not implemented: OpenAI-compatible completion");
  }
}
