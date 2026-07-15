/** Provider precondition gate (S1-05; FR-020, FR-021, FR-022, EIR-014).
 *
 * Lives in workflows/ because the dependency matrix forbids ui/ → providers/:
 * ui/ → workflows/ and workflows/ → providers/ (interface) are both allowed.
 * Sprint 2's workflow orchestrator calls the same ensureProviderReady() as
 * its BR-001 gate — the settings "Test connection" button and workflows share
 * one validation path. */

import {
  PREF_KEYS,
  PREF_DEFAULTS,
  getIntPref,
  getStringPref,
  type PrefStore,
} from "../core/config";
import { CREDENTIAL_IDS, type CredentialStore } from "../core/credentials";
import {
  AgentError,
  InvalidConfigError,
  toUserMessage,
  type ErrorCode,
  type Logger,
} from "../core/errors";
import type { ProviderRegistry } from "../providers/registry";
import type { AIProvider, FetchLike, ProviderSettings } from "../providers/types";

export interface ProviderGateDeps {
  prefs: PrefStore;
  credentials: CredentialStore;
  registry: ProviderRegistry;
  fetch: FetchLike;
  logger: Logger;
  createAbortController?: () => AbortController;
}

/** Resolve prefs + stored credential into settings for the active provider. */
export async function resolveProviderSettings(
  deps: ProviderGateDeps,
): Promise<{ id: string; settings: ProviderSettings }> {
  const id = getStringPref(
    deps.prefs,
    PREF_KEYS.activeProvider,
    PREF_DEFAULTS[PREF_KEYS.activeProvider] as string,
  );
  const apiKey = await deps.credentials.get(CREDENTIAL_IDS.openaiApiKey);
  const settings: ProviderSettings = {
    id,
    endpoint: getStringPref(deps.prefs, PREF_KEYS.openaiEndpoint),
    model: getStringPref(deps.prefs, PREF_KEYS.openaiModel),
    ...(apiKey !== null ? { apiKey } : {}),
    timeoutMs: getIntPref(
      deps.prefs,
      PREF_KEYS.requestTimeoutMs,
      PREF_DEFAULTS[PREF_KEYS.requestTimeoutMs] as number,
    ),
  };
  return { id, settings };
}

function instantiateActiveProvider(
  deps: ProviderGateDeps,
  id: string,
  settings: ProviderSettings,
): AIProvider {
  if (!deps.registry.has(id)) {
    throw new InvalidConfigError(
      `Unknown AI provider '${id}'. Select a provider in the settings.`,
    );
  }
  return deps.registry.create(id, settings, {
    fetch: deps.fetch,
    logger: deps.logger,
    createAbortController: deps.createAbortController,
  });
}

/** Workflow precondition gate: returns the validated provider or throws a
 * typed AgentError. Workflows must call this before any completion (BR-001
 * chain: validation happens on the same explicit user action). */
export async function ensureProviderReady(deps: ProviderGateDeps): Promise<AIProvider> {
  const { id, settings } = await resolveProviderSettings(deps);
  const provider = instantiateActiveProvider(deps, id, settings);
  const result = await provider.validateConfig();
  if (!result.ok) {
    deps.logger.log(`provider validation failed: ${result.error.code}`);
    throw result.error;
  }
  deps.logger.log(`provider '${id}' validated`);
  return provider;
}

/** UI-facing wrapper for the settings "Test connection" button: never throws,
 * always yields a distinct plain-language message (EIR-014). */
export type TestConnectionResult =
  | { ok: true; message: string }
  | { ok: false; code: ErrorCode; message: string };

export async function testConnection(deps: ProviderGateDeps): Promise<TestConnectionResult> {
  try {
    const { id, settings } = await resolveProviderSettings(deps);
    const provider = instantiateActiveProvider(deps, id, settings);
    const result = await provider.validateConfig();
    if (result.ok) return { ok: true, message: result.message };
    deps.logger.error("test connection failed", result.error);
    return { ok: false, code: result.error.code, message: toUserMessage(result.error) };
  } catch (error) {
    const code: ErrorCode = error instanceof AgentError ? error.code : "unknown";
    deps.logger.error("test connection failed", error);
    return { ok: false, code, message: toUserMessage(error) };
  }
}
