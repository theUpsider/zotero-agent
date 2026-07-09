/** Provider registry (S1-01, EIR-013): providers register by id; a new
 * provider needs a class in src/providers/ plus one register call here —
 * nothing outside this directory changes. Active-provider *policy* (which id
 * the prefs select) lives in the gate, not here. */

import { InvalidConfigError } from "../core/errors";
import type { AIProvider, ProviderDeps, ProviderSettings } from "./types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export type ProviderFactory = (settings: ProviderSettings, deps: ProviderDeps) => AIProvider;

export class ProviderRegistry {
  private readonly factories = new Map<string, { label: string; factory: ProviderFactory }>();

  register(id: string, label: string, factory: ProviderFactory): void {
    this.factories.set(id, { label, factory });
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  /** For the settings dropdown (FR-021). */
  entries(): { id: string; label: string }[] {
    return [...this.factories.entries()].map(([id, { label }]) => ({ id, label }));
  }

  create(id: string, settings: ProviderSettings, deps: ProviderDeps): AIProvider {
    const entry = this.factories.get(id);
    if (!entry) {
      throw new InvalidConfigError(
        `Unknown AI provider '${id}'. Select a provider in the settings.`,
      );
    }
    return entry.factory(settings, deps);
  }
}

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    OpenAICompatibleProvider.ID,
    OpenAICompatibleProvider.LABEL,
    (settings, deps) => new OpenAICompatibleProvider(settings, deps),
  );
  return registry;
}
