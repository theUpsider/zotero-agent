import { describe, expect, it, vi } from "vitest";
import chatCompletionFixture from "./fixtures/openai/chat-completion.json";
import modelsFixture from "./fixtures/openai/models.json";
import error401Fixture from "./fixtures/openai/error-401.json";
import ollamaModelMissingFixture from "./fixtures/openai/ollama-model-missing.json";
import {
  OpenAICompatibleProvider,
  buildChatCompletionRequest,
  classifyHttpError,
  normalizeBaseUrl,
  parseChatCompletionResponse,
  parseModelsResponse,
} from "../src/providers/openaiCompatible";
import type { FetchLike, ProviderSettings } from "../src/providers/types";
import {
  AuthenticationError,
  InvalidConfigError,
  ModelNotFoundError,
  ProviderResponseError,
  ProviderUnavailableError,
  noopLogger,
} from "../src/core/errors";

const settings: ProviderSettings = {
  id: "openai-compatible",
  endpoint: "http://localhost:11434/v1",
  model: "llama3",
  apiKey: "sk-secret-key",
  timeoutMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function provider(fetch: FetchLike, overrides: Partial<ProviderSettings> = {}) {
  return new OpenAICompatibleProvider({ ...settings, ...overrides }, { fetch, logger: noopLogger });
}

describe("normalizeBaseUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeBaseUrl(" http://localhost:11434/v1/ ")).toBe("http://localhost:11434/v1");
    expect(normalizeBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });

  it("rejects non-http endpoints", () => {
    expect(() => normalizeBaseUrl("localhost:11434")).toThrow(InvalidConfigError);
    expect(() => normalizeBaseUrl("ftp://example.org")).toThrow(InvalidConfigError);
  });
});

describe("buildChatCompletionRequest", () => {
  it("targets {base}/chat/completions with a JSON body", () => {
    const { url, init } = buildChatCompletionRequest(settings, {
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 5,
      temperature: 0.2,
    });
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      max_tokens: 5,
      temperature: 0.2,
    });
  });

  it("sends a Bearer header only when a key is configured", () => {
    const withKey = buildChatCompletionRequest(settings, { messages: [] });
    expect((withKey.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-secret-key",
    );
    const withoutKey = buildChatCompletionRequest(
      { ...settings, apiKey: undefined },
      { messages: [] },
    );
    expect((withoutKey.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("response parsing", () => {
  it("parses a chat completion fixture", () => {
    const result = parseChatCompletionResponse(chatCompletionFixture);
    expect(result.text).toMatch(/randomized controlled trial/);
    expect(result.model).toBe("llama3");
    expect(result.usage).toEqual({ promptTokens: 42, completionTokens: 12 });
  });

  it("throws ProviderResponseError on malformed bodies", () => {
    expect(() => parseChatCompletionResponse({ choices: [] })).toThrow(ProviderResponseError);
    expect(() => parseChatCompletionResponse(null)).toThrow(ProviderResponseError);
  });

  it("parses the models fixture", () => {
    expect(parseModelsResponse(modelsFixture)).toEqual(["llama3", "mistral", "gpt-4o-mini"]);
  });
});

describe("classifyHttpError", () => {
  it("maps 401/403 to AuthenticationError", () => {
    expect(classifyHttpError(401, JSON.stringify(error401Fixture), settings)).toBeInstanceOf(
      AuthenticationError,
    );
    expect(classifyHttpError(403, "", settings)).toBeInstanceOf(AuthenticationError);
  });

  it("maps a model-mentioning 404 to ModelNotFoundError", () => {
    const error = classifyHttpError(404, JSON.stringify(ollamaModelMissingFixture), settings);
    expect(error).toBeInstanceOf(ModelNotFoundError);
    expect(error.message).toContain("llama3");
  });

  it("maps plain 404 and 5xx to ProviderUnavailableError", () => {
    expect(classifyHttpError(404, "not found", settings)).toBeInstanceOf(ProviderUnavailableError);
    expect(classifyHttpError(500, "oops", settings)).toBeInstanceOf(ProviderUnavailableError);
  });

  it("never includes the API key even when the body echoes it (S1-04)", () => {
    const body = `bad request: Authorization: Bearer ${settings.apiKey}`;
    for (const status of [400, 404, 500]) {
      const error = classifyHttpError(status, body, settings);
      expect(error.message).not.toContain(settings.apiKey);
      expect(String(error.cause ?? "")).not.toContain(settings.apiKey);
    }
  });
});

describe("OpenAICompatibleProvider.complete", () => {
  it("returns the parsed completion and emits one chunk", async () => {
    const fetch = vi.fn(async () => jsonResponse(chatCompletionFixture));
    const chunks: string[] = [];
    const result = await provider(fetch).complete(
      { messages: [{ role: "user", content: "hi" }] },
      (chunk) => chunks.push(chunk.text),
    );
    expect(result.text).toMatch(/randomized controlled trial/);
    expect(chunks).toEqual([result.text]);
  });

  it("throws InvalidConfigError before any network call when unconfigured", async () => {
    const fetch = vi.fn();
    await expect(
      provider(fetch, { endpoint: "" }).complete({ messages: [] }),
    ).rejects.toBeInstanceOf(InvalidConfigError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps network failure to ProviderUnavailableError (FR-022)", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    });
    await expect(provider(fetch).complete({ messages: [] })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("times out and reports the provider as unavailable", async () => {
    vi.useFakeTimers();
    try {
      const fetch: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      const pending = provider(fetch, { timeoutMs: 50 }).complete({ messages: [] });
      const assertion = expect(pending).rejects.toBeInstanceOf(ProviderUnavailableError);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OpenAICompatibleProvider.validateConfig", () => {
  it("succeeds when /models lists the configured model", async () => {
    const fetch = vi.fn(async () => jsonResponse(modelsFixture));
    const result = await provider(fetch).validateConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toMatch(/llama3/);
      expect(result.models).toContain("llama3");
    }
  });

  it("reports ModelNotFoundError when the model is absent from /models", async () => {
    const fetch = vi.fn(async () => jsonResponse(modelsFixture));
    const result = await provider(fetch, { model: "missing-model" }).validateConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ModelNotFoundError);
  });

  it("reports AuthenticationError on 401", async () => {
    const fetch = vi.fn(async () => jsonResponse(error401Fixture, 401));
    const result = await provider(fetch).validateConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(AuthenticationError);
  });

  it("falls back to a 1-token completion when /models is unsupported", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/models")) return new Response("not found", { status: 404 });
      return jsonResponse(chatCompletionFixture);
    });
    const result = await provider(fetch).validateConfig();
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const completionBody = JSON.parse(fetch.mock.calls[1]?.[1]?.body as string);
    expect(completionBody.max_tokens).toBe(1);
  });

  it("reports InvalidConfigError without touching the network when unconfigured", async () => {
    const fetch = vi.fn();
    const result = await provider(fetch, { endpoint: "", model: "" }).validateConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(InvalidConfigError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports ProviderUnavailableError when offline", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("NetworkError");
    });
    const result = await provider(fetch).validateConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProviderUnavailableError);
  });
});
