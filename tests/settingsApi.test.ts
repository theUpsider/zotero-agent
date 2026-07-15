import { describe, expect, it, vi } from "vitest";
import { PREF_KEYS, type PrefStore } from "../src/core/config";
import type { CredentialStore } from "../src/core/credentials";
import { noopLogger } from "../src/core/errors";
import { createDefaultRegistry } from "../src/providers/registry";
import type { IndexAdmin, IndexStatus } from "../src/retrieval/indexManager";
import { createSettingsApi } from "../src/ui/settingsApi";
import type { ProviderGateDeps } from "../src/workflows/providerGate";

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

function fakeCredentials(): CredentialStore {
  let value: string | null = null;
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

function deps(): ProviderGateDeps {
  return {
    prefs: fakePrefs({ [PREF_KEYS.activeProvider]: "openai-compatible" }),
    credentials: fakeCredentials(),
    registry: createDefaultRegistry(),
    fetch: vi.fn(),
    logger: noopLogger,
  };
}

const STATUS: IndexStatus = {
  state: "idle",
  queued: 0,
  indexedItems: 3,
  totalItems: null,
  lastUpdated: 123,
  progress: null,
  vectorSearch: false,
  lastError: null,
};

function fakeIndexAdmin(): IndexAdmin & { rebuild: ReturnType<typeof vi.fn>; cancelRebuild: ReturnType<typeof vi.fn> } {
  return {
    status: () => STATUS,
    rebuild: vi.fn(),
    cancelRebuild: vi.fn(),
  };
}

describe("createSettingsApi — index status delegation (S3-08)", () => {
  it("returns null from indexStatus when no index admin is wired", () => {
    const api = createSettingsApi(deps());
    expect(api.indexStatus()).toBeNull();
  });

  it("delegates indexStatus/rebuildIndex/cancelIndexRebuild to the injected IndexAdmin", () => {
    const index = fakeIndexAdmin();
    const api = createSettingsApi(deps(), index);

    expect(api.indexStatus()).toEqual(STATUS);
    api.rebuildIndex();
    expect(index.rebuild).toHaveBeenCalledTimes(1);
    api.cancelIndexRebuild();
    expect(index.cancelRebuild).toHaveBeenCalledTimes(1);
  });

  it("rebuildIndex/cancelIndexRebuild are no-ops (not throwing) with no index admin", () => {
    const api = createSettingsApi(deps());
    expect(() => api.rebuildIndex()).not.toThrow();
    expect(() => api.cancelIndexRebuild()).not.toThrow();
  });
});
