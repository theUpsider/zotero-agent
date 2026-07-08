# Sprint 1 — Provider & Configuration Foundation

**Sprint goal:** A user can open the plugin settings inside Zotero, configure an
OpenAI-compatible provider (endpoint, model, credentials) and the color-semantics mapping,
and the plugin validates the provider configuration with a test call. Settings survive
a Zotero restart.

**Demo script:** Open settings → enter Ollama/OpenAI endpoint + model + key → "Test connection"
succeeds/fails with a clear message → remap two colors to custom categories → restart Zotero →
everything persisted.

**Requirements covered:** FR-001, FR-013, FR-016…FR-022, FR-002, FR-023…FR-031,
EIR-007, EIR-008, EIR-011…EIR-014, DAR-002, DAR-006, DAR-007, DAR-008,
NFR-011, NFR-012, NFR-016, BR-005, BR-006. Spike: OP-003/OP-004 (FR-014/FR-015, EIR-009/EIR-010).

---

## Backlog (priority-sorted)

### S1-01 · Provider abstraction finalized · **Must** · M
**Refs:** EIR-007, EIR-012, EIR-013, NFR-026
Finalize the `AIProvider` interface (currently a stub): `validateConfig`, `complete`
(request/response types incl. streaming-ready shape), provider registry keyed by provider id,
active-provider selection from prefs. No workflow code may reference a concrete provider class.

**Acceptance criteria**
- [ ] `AIProvider` interface supports config validation and completion with typed errors.
- [ ] Provider registry resolves the active provider from `extensions.zotero-agent.provider.active`.
- [ ] Adding a new provider requires no changes outside `src/providers/` (verified by a registry unit test registering a fake provider).
- [ ] Provider-specific request/response handling is fully encapsulated (EIR-012); callers see only the common types.
- [ ] Unit tests cover registry resolution and error mapping.

### S1-02 · Configuration model & persistence · **Must** · S
**Refs:** DAR-002, DAR-007, FR-017, FR-018, FR-021, OP-006
Extend `src/core/config.ts` into the full config model: provider settings (endpoint, model,
active provider), color semantics, feature flags. Storage = Zotero prefs (decision for OP-006).
Typed read/write helpers with fallbacks; all keys documented in one place.

**Acceptance criteria**
- [ ] All config keys defined in `PREF_KEYS` with types and defaults; no ad-hoc pref strings elsewhere.
- [ ] Config values persist across Zotero restarts (manual smoke test).
- [ ] Invalid stored values fall back to safe defaults without crashing (unit-tested).
- [ ] OP-006 documented as decided: prefs-based storage, key schema in `config.ts`.

### S1-03 · OpenAI-compatible provider (real implementation) · **Must** · M
**Refs:** FR-013, FR-016, FR-017, FR-018, EIR-008, EIR-011, FR-022
Replace the `OpenAICompatibleProvider` stub: chat-completions call against a configurable
base URL (works for OpenAI, Ollama, LM Studio, vLLM — this also satisfies "locally hosted
models" FR-016/EIR-011), model listing where the endpoint supports `/models`, timeout and
offline handling.

**Acceptance criteria**
- [ ] `complete()` returns model output for a valid endpoint/model/key (manually verified against Ollama or OpenAI).
- [ ] Network failure / offline yields a typed `ProviderUnavailableError` with a user-readable message, not a stack trace (FR-022, EIR-014).
- [ ] Base URL, model id, and API key are all read from config; no hardcoded values.
- [ ] Request building and response parsing unit-tested against recorded fixtures (no live HTTP in tests).

### S1-04 · Credential storage · **Must** · M
**Refs:** FR-019, DAR-008, NFR-011, NFR-012
Store API keys via Zotero's login-manager/secure storage where available; prefs fallback
documented as such. Redaction helper so keys never appear in logs, errors, or UI.

**Acceptance criteria**
- [ ] API key entered in settings is not stored in plain text in `prefs.js` when secure storage is available; fallback behavior documented in README.
- [ ] A `redact()` helper masks credentials; all provider error paths route through it (unit-tested: error containing the key never surfaces it).
- [ ] Key can be updated and removed via settings.

### S1-05 · Provider validation before workflow use · **Must** · S
**Refs:** FR-020, FR-021, FR-022, EIR-014
`validateConfig()` performs a cheap live check (auth + model reachable). Exposed as
"Test connection" in settings and enforced as a precondition gate that later workflow
code will call.

**Acceptance criteria**
- [ ] "Test connection" reports success, auth failure, unreachable endpoint, and unknown model as distinct, understandable messages (EIR-014).
- [ ] A reusable `ensureProviderReady()` gate exists that workflows can call; returns the validated provider or a typed error.
- [ ] Offline state produces a clear "provider unavailable — you are offline" message (FR-022).

### S1-06 · Settings UI: provider section · **Must** · M
**Refs:** FR-001, FR-013, FR-017, FR-018, FR-019, FR-021, NFR-013
Plugin preference pane (Zotero 9 `registerPrefPane`) with provider selection, endpoint,
model, API key fields, and the Test-connection button. No embeddings/RAG jargon (NFR-013).

**Acceptance criteria**
- [ ] Pref pane appears in Zotero settings; all fields read/write the config model from S1-02.
- [ ] Active provider selectable from registered providers (FR-021).
- [ ] Labels are plain-language; no mention of embeddings/RAG internals (NFR-013).
- [ ] Manual smoke test documented in `docs/sprints/smoke-tests.md` (create file this sprint).

### S1-07 · Settings UI: color semantics section · **Must** · M
**Refs:** FR-002, FR-023…FR-031, FR-026, DAR-006, NFR-016, BR-005, BR-006
UI mapping each detected standard Zotero annotation color to one or more categories.
Uses the existing pure module `src/core/colorSemantics.ts`. Custom labels, add/remove/edit
categories, reset-to-default button.

**Acceptance criteria**
- [ ] All 8 standard Zotero colors shown with color swatch and current category assignment (FR-026, FR-027).
- [ ] A color can hold multiple categories (FR-028, BR-005); a category can be renamed, added, removed (FR-025, FR-029).
- [ ] Defaults are the 7 scholarly categories (BR-006, FR-024); "Reset to defaults" restores them (FR-031).
- [ ] Mapping persists across restart (FR-030, DAR-006) — manual smoke test.
- [ ] Serialization round-trip unit-tested via existing `serializeColorSemantics`/`parseColorSemantics`.

### S1-08 · Spike: Codex & GitHub Copilot feasibility · **Should** · S (timeboxed 1 day)
**Refs:** FR-014, FR-015, EIR-009, EIR-010, OP-003, OP-004, ASM-004
Investigate whether Codex/Copilot can be reached as provider integrations (API access,
auth model, ToS). Outcome is a written decision, not code.

**Acceptance criteria**
- [ ] `docs/research/provider-feasibility.md` exists with a go/no-go per provider, auth mechanism, and effort estimate.
- [ ] If "go": backlog item drafted for Sprint 5 stretch (S5-08). If "no-go": FR-014/FR-015 marked "not technically feasible" with rationale (the requirement's own escape hatch).

### S1-09 · Error/status plumbing · **Should** · S
**Refs:** EIR-014, NFR-012, §15.2 Error/Status Manager
Central error-to-message mapping and a status/logging helper (`Zotero.debug` namespaced),
used by provider + settings code. Foundation for progress reporting in Sprint 2.

**Acceptance criteria**
- [ ] One module maps typed errors → user-facing messages; provider errors from S1-03/S1-05 route through it.
- [ ] Log output is namespaced (`[zotero-agent]`) and never contains credentials (ties into S1-04 redaction).

---

## Out of sprint / explicitly deferred
- Any workflow execution (Sprint 2).
- Retrieval/index work (Sprint 3).
- Codex/Copilot *implementation* (Sprint 5 stretch, only if S1-08 says "go").

## Definition of Done (sprint level)
- `npm test` and `npm run typecheck` green; new pure logic unit-tested.
- `.xpi` builds and installs in Zotero 9.0.x; settings demo script passes.
- Smoke-test steps recorded in `docs/sprints/smoke-tests.md`.
- No secrets in logs/UI (spot check).
