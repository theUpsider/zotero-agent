import { describe, expect, it, vi } from "vitest";
import {
  ensureProviderReady,
  resolveProviderSettings,
  testConnection,
  type ProviderGateDeps,
} from "../src/workflows/providerGate";
import { PREF_KEYS, type PrefStore } from "../src/core/config";
import type { CredentialStore } from "../src/core/credentials";
import { AgentError, noopLogger } from "../src/core/errors";
import { createDefaultRegistry } from "../src/providers/registry";
import type { FetchLike } from "../src/providers/types";
import modelsFixture from "./fixtures/openai/models.json";
import error401Fixture from "./fixtures/openai/error-401.json";

function fakePrefs(values: Record<string, unknown> = {}): PrefStore {
  return {
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
    },
    clear: (key) => {
      delete values[key];
    },
  };
}

function fakeCredentials(secret: string | null = null): CredentialStore {
  let value = secret;
  return {
    kind: "prefs-fallback",
    get: async () => value,
    set: async (_id, s) => {
      value = s;
    },
    remove: async () => {
      value = null;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function deps(overrides: Partial<ProviderGateDeps> = {}): ProviderGateDeps {
  return {
    prefs: fakePrefs({
      [PREF_KEYS.activeProvider]: "openai-compatible",
      [PREF_KEYS.openaiEndpoint]: "http://localhost:11434/v1",
      [PREF_KEYS.openaiModel]: "llama3",
    }),
    credentials: fakeCredentials("sk-secret"),
    registry: createDefaultRegistry(),
    fetch: async () => jsonResponse(modelsFixture),
    logger: noopLogger,
    ...overrides,
  };
}

describe("resolveProviderSettings", () => {
  it("assembles settings from prefs and the credential store", async () => {
    const { id, settings } = await resolveProviderSettings(deps());
    expect(id).toBe("openai-compatible");
    expect(settings).toMatchObject({
      endpoint: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "sk-secret",
      timeoutMs: 300000,
    });
  });

  it("omits apiKey when no credential is stored", async () => {
    const { settings } = await resolveProviderSettings(deps({ credentials: fakeCredentials() }));
    expect("apiKey" in settings).toBe(false);
  });
});

describe("testConnection — five distinct outcomes (S1-05)", () => {
  it("success", async () => {
    const result = await testConnection(deps());
    expect(result).toEqual({ ok: true, message: "Connected. Model 'llama3' is available." });
  });

  it("auth failure", async () => {
    const result = await testConnection(deps({ fetch: async () => jsonResponse(error401Fixture, 401) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("auth-failed");
      expect(result.message).toMatch(/rejected the api key/i);
    }
  });

  it("unreachable endpoint / offline (FR-022)", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("NetworkError");
    };
    const result = await testConnection(deps({ fetch }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider-unavailable");
      expect(result.message).toMatch(/could not reach/i);
    }
  });

  it("unknown model", async () => {
    const d = deps();
    d.prefs.set(PREF_KEYS.openaiModel, "missing-model");
    const result = await testConnection(d);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("model-not-found");
      expect(result.message).toContain("missing-model");
    }
  });

  it("invalid config short-circuits without a network call", async () => {
    const fetch = vi.fn();
    const d = deps({ fetch });
    d.prefs.set(PREF_KEYS.openaiEndpoint, "");
    const result = await testConnection(d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid-config");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("unknown active provider id yields invalid-config", async () => {
    const d = deps();
    d.prefs.set(PREF_KEYS.activeProvider, "nope");
    const result = await testConnection(d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid-config");
  });
});

describe("ensureProviderReady", () => {
  it("returns the validated provider on success", async () => {
    const provider = await ensureProviderReady(deps());
    expect(provider.id).toBe("openai-compatible");
  });

  it("throws a typed AgentError on failure", async () => {
    const d = deps({ fetch: async () => jsonResponse(error401Fixture, 401) });
    await expect(ensureProviderReady(d)).rejects.toBeInstanceOf(AgentError);
    await expect(ensureProviderReady(d)).rejects.toMatchObject({ code: "auth-failed" });
  });

  it("resolves the stored credential into the request (key flow)", async () => {
    const seen: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      seen.push(headers.Authorization ?? "");
      return jsonResponse(modelsFixture);
    };
    await ensureProviderReady(deps({ fetch, credentials: fakeCredentials("sk-from-store") }));
    expect(seen).toEqual(["Bearer sk-from-store"]);
  });
});
