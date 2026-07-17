/** OpenAI-compatible endpoint provider (S1-03; FR-013, FR-016, FR-017,
 * EIR-008, EIR-011). One implementation covers OpenAI, Ollama, LM Studio and
 * vLLM — anything speaking the /chat/completions dialect. Pure request
 * building and response parsing are exported for fixture tests; no live HTTP
 * in unit tests. Error messages are built from status/model/URL only, so the
 * API key cannot appear in them by construction (NFR-012). */

import {
  AgentError,
  AuthenticationError,
  ContextLimitError,
  InvalidConfigError,
  ModelNotFoundError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  redact,
} from "../core/errors";
import type {
  AIProvider,
  ChunkHandler,
  CompletionRequest,
  CompletionResult,
  ModelCapabilities,
  ProviderDeps,
  ProviderSettings,
  ValidationResult,
} from "./types";

/** Trim, require http(s), strip trailing slashes. Throws InvalidConfigError. */
export function normalizeBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new InvalidConfigError(
      "The endpoint URL must start with http:// or https:// (e.g. http://localhost:11434/v1).",
    );
  }
  return trimmed;
}

function headers(settings: ProviderSettings): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  // Ollama/LM Studio run keyless; only send auth when a key is configured.
  if (settings.apiKey) result.Authorization = `Bearer ${settings.apiKey}`;
  return result;
}

export function buildChatCompletionRequest(
  settings: ProviderSettings,
  request: CompletionRequest,
): { url: string; init: RequestInit } {
  const base = normalizeBaseUrl(settings.endpoint);
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: request.messages,
    stream: false,
  };
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.topP !== undefined) body.top_p = request.topP;
  if (request.responseFormat !== undefined)
    body.response_format = request.responseFormat;
  return {
    url: `${base}/chat/completions`,
    init: {
      method: "POST",
      headers: headers(settings),
      body: JSON.stringify(body),
    },
  };
}

export function parseChatCompletionResponse(body: unknown): CompletionResult {
  const data = body as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    model?: unknown;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new ProviderResponseError(
      "The AI service returned an unexpected response.",
    );
  }
  const result: CompletionResult = { text: content };
  if (data.choices?.[0]?.finish_reason === "length") result.truncated = true;
  if (typeof data.model === "string") result.model = data.model;
  const usage = data.usage;
  if (usage) {
    result.usage = {
      ...(typeof usage.prompt_tokens === "number"
        ? { promptTokens: usage.prompt_tokens }
        : {}),
      ...(typeof usage.completion_tokens === "number"
        ? { completionTokens: usage.completion_tokens }
        : {}),
    };
  }
  return result;
}

export function parseModelsResponse(body: unknown): string[] {
  const data = body as { data?: { id?: unknown }[] };
  if (!Array.isArray(data?.data)) {
    throw new ProviderResponseError(
      "The AI service returned an unexpected response.",
    );
  }
  return data.data
    .map((entry) => entry?.id)
    .filter((id): id is string => typeof id === "string");
}

const CONTEXT_FIELDS = [
  "context_length",
  "max_context_length",
  "max_model_len",
  "context_window",
] as const;

/** Read common OpenAI-compatible context-window fields for one model. Unknown
 * response extensions are ignored and listModels() keeps returning ids only. */
export function parseModelCapabilitiesResponse(
  body: unknown,
  model: string,
): ModelCapabilities | undefined {
  const data = body as { data?: Record<string, unknown>[] };
  if (!Array.isArray(data?.data)) return undefined;
  const entry = data.data.find((candidate) => candidate?.id === model);
  if (!entry) return undefined;
  for (const field of CONTEXT_FIELDS) {
    const value = entry[field];
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(numeric) && numeric > 0) {
      return { contextWindowTokens: Math.floor(numeric) };
    }
  }
  return undefined;
}

/** Map an HTTP error status to a typed error. Body text is truncated and
 * redacted before it can enter an error message. */
export function classifyHttpError(
  status: number,
  bodyText: string,
  settings: ProviderSettings,
): AgentError {
  const secrets = settings.apiKey ? [settings.apiKey] : [];
  const detail = redact(bodyText.slice(0, 200), secrets);
  if (status === 401 || status === 403) {
    return new AuthenticationError("The AI service rejected the API key.");
  }
  const contextLimitPattern =
    /context[_ -]?(?:length|window)|maximum context|max_model_len|too many tokens|token limit|request too large/i;
  if (
    (status === 400 || status === 413 || status === 422) &&
    contextLimitPattern.test(detail)
  ) {
    return new ContextLimitError(
      "The request exceeded the model's context window.",
    );
  }
  if (
    (status === 404 || status === 400) &&
    detail.toLowerCase().includes("model")
  ) {
    return new ModelNotFoundError(
      `The model '${settings.model}' was not found on this endpoint.`,
    );
  }
  if (status === 404) {
    return new ProviderUnavailableError(
      "The endpoint responded but does not offer this API. Check the endpoint URL.",
    );
  }
  return new ProviderUnavailableError(
    `The AI service responded with an error (HTTP ${status}).`,
    { cause: detail },
  );
}

function validateSettings(
  settings: ProviderSettings,
): InvalidConfigError | null {
  if (!settings.endpoint.trim() || !settings.model.trim()) {
    return new InvalidConfigError(
      "The provider is not fully configured. Enter an endpoint URL and model in the settings.",
    );
  }
  try {
    normalizeBaseUrl(settings.endpoint);
  } catch (error) {
    if (error instanceof InvalidConfigError) return error;
    throw error;
  }
  return null;
}

export class OpenAICompatibleProvider implements AIProvider {
  static readonly ID = "openai-compatible";
  static readonly LABEL = "OpenAI-compatible (OpenAI, Ollama, LM Studio, vLLM)";

  readonly id = OpenAICompatibleProvider.ID;
  readonly label = OpenAICompatibleProvider.LABEL;
  private modelsResponse: unknown | undefined;

  constructor(
    private readonly settings: ProviderSettings,
    private readonly deps: ProviderDeps,
  ) {}

  /** Live check (S1-05 engine): local fields → GET /models → fall back to a
   * 1-token completion when /models is unsupported. */
  async validateConfig(): Promise<ValidationResult> {
    const configError = validateSettings(this.settings);
    if (configError) return { ok: false, error: configError };

    try {
      const models = await this.listModels();
      if (!models.includes(this.settings.model)) {
        return {
          ok: false,
          error: new ModelNotFoundError(
            `The model '${this.settings.model}' was not found on this endpoint.`,
          ),
        };
      }
      return {
        ok: true,
        message: `Connected. Model '${this.settings.model}' is available.`,
        models,
      };
    } catch (error) {
      // Endpoint without /models support (or odd response): fall through to a
      // minimal completion, which verifies endpoint + auth + model in one go.
      if (
        error instanceof AgentError &&
        (error.code === "provider-response" ||
          (error.code === "provider-unavailable" &&
            this.isEndpointOnlyMiss(error)))
      ) {
        return this.validateViaCompletion();
      }
      return { ok: false, error: this.asAgentError(error) };
    }
  }

  private isEndpointOnlyMiss(error: AgentError): boolean {
    // classifyHttpError marks a plain 404 with this message.
    return error.message.includes("does not offer this API");
  }

  private async validateViaCompletion(): Promise<ValidationResult> {
    try {
      await this.complete({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 1,
      });
      return {
        ok: true,
        message: `Connected. Model '${this.settings.model}' responded.`,
      };
    } catch (error) {
      return { ok: false, error: this.asAgentError(error) };
    }
  }

  async complete(
    request: CompletionRequest,
    onChunk?: ChunkHandler,
  ): Promise<CompletionResult> {
    const configError = validateSettings(this.settings);
    if (configError) throw configError;

    const { url, init } = buildChatCompletionRequest(this.settings, request);
    const response = await this.send(url, init, request.signal);
    if (!response.ok) {
      throw classifyHttpError(
        response.status,
        await this.safeText(response),
        this.settings,
      );
    }
    const result = parseChatCompletionResponse(await this.safeJson(response));
    // Streaming-ready: emit the buffered result as a single chunk (S1-01).
    onChunk?.({ text: result.text });
    return result;
  }

  async listModels(): Promise<string[]> {
    return parseModelsResponse(await this.fetchModelsResponse());
  }

  async getModelCapabilities(): Promise<ModelCapabilities | undefined> {
    return parseModelCapabilitiesResponse(
      await this.fetchModelsResponse(),
      this.settings.model,
    );
  }

  private async fetchModelsResponse(): Promise<unknown> {
    if (this.modelsResponse !== undefined) return this.modelsResponse;
    const base = normalizeBaseUrl(this.settings.endpoint);
    const response = await this.send(`${base}/models`, {
      method: "GET",
      headers: headers(this.settings),
    });
    if (!response.ok) {
      throw classifyHttpError(
        response.status,
        await this.safeText(response),
        this.settings,
      );
    }
    this.modelsResponse = await this.safeJson(response);
    return this.modelsResponse;
  }

  /** fetch with timeout; network failures and aborts become typed errors. */
  private async send(
    url: string,
    init: RequestInit,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = (
      this.deps.createAbortController ?? (() => new AbortController())
    )();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.settings.timeoutMs);
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      return await this.deps.fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new ProviderTimeoutError(
          `The AI request timed out after ${this.settings.timeoutMs} ms.`,
          { cause: error },
        );
      }
      throw new ProviderUnavailableError(
        "Could not reach the AI service. Check the endpoint URL and your internet connection.",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new ProviderResponseError(
        "The AI service returned an unexpected response.",
        {
          cause: error,
        },
      );
    }
  }

  private asAgentError(error: unknown): AgentError {
    if (error instanceof AgentError) return error;
    return new ProviderUnavailableError(
      "Could not reach the AI service. Check the endpoint URL and your internet connection.",
      { cause: error },
    );
  }
}
