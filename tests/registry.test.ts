import { describe, expect, it } from "vitest";
import { ProviderRegistry, createDefaultRegistry } from "../src/providers/registry";
import type { AIProvider, ProviderSettings } from "../src/providers/types";
import { InvalidConfigError, noopLogger } from "../src/core/errors";

const settings: ProviderSettings = {
  id: "fake",
  endpoint: "http://example.org/v1",
  model: "fake-model",
  timeoutMs: 1000,
};

function fakeProvider(received: ProviderSettings): AIProvider {
  return {
    id: "fake",
    label: "Fake provider",
    validateConfig: async () => ({ ok: true, message: `ok:${received.model}` }),
    complete: async () => ({ text: "fake" }),
  };
}

describe("ProviderRegistry", () => {
  it("creates a registered provider with its settings (EIR-013)", async () => {
    const registry = new ProviderRegistry();
    registry.register("fake", "Fake provider", (s) => fakeProvider(s));
    const provider = registry.create("fake", settings, { fetch: async () => new Response(), logger: noopLogger });
    expect(provider.id).toBe("fake");
    const result = await provider.validateConfig();
    expect(result.ok && result.message).toBe("ok:fake-model");
  });

  it("throws InvalidConfigError for an unknown provider id", () => {
    const registry = new ProviderRegistry();
    expect(() =>
      registry.create("nope", settings, { fetch: async () => new Response(), logger: noopLogger }),
    ).toThrow(InvalidConfigError);
  });

  it("lists registered providers for the settings dropdown (FR-021)", () => {
    const registry = new ProviderRegistry();
    registry.register("fake", "Fake provider", (s) => fakeProvider(s));
    expect(registry.entries()).toEqual([{ id: "fake", label: "Fake provider" }]);
    expect(registry.has("fake")).toBe(true);
    expect(registry.has("nope")).toBe(false);
  });
});

describe("createDefaultRegistry", () => {
  it("registers the OpenAI-compatible provider", () => {
    const registry = createDefaultRegistry();
    expect(registry.has("openai-compatible")).toBe(true);
    expect(registry.entries().map((e) => e.id)).toContain("openai-compatible");
  });
});
