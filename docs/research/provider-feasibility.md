# Provider feasibility: Codex & GitHub Copilot (S1-08 spike)

Decision record for FR-014/FR-015, EIR-009/EIR-010, OP-003/OP-004, ASM-004.
Timeboxed spike, Sprint 1. Outcome is a written go/no-go, no code.

## Summary

| Provider | Verdict | Reason |
|----------|---------|--------|
| OpenAI "Codex" | **No-go** (as a distinct integration) | The original Codex completion models are retired; today's "Codex" is an agent product tied to ChatGPT accounts with no third-party completion API. Anything OpenAI offers via API is already covered by the OpenAI-compatible provider. |
| GitHub Copilot | **No-go** | No official third-party API. The only known access path is the unofficial editor-plugin token exchange, which violates GitHub's terms of service. |

Both requirements carry the escape hatch "where technically feasible"
(FR-014, FR-015). Per this spike they are **not technically feasible** as
distinct provider integrations; marked accordingly. No S5-08 stretch item is
drafted.

## OpenAI Codex (FR-014, EIR-009, OP-004)

- The Codex *models* (`code-davinci-002` etc.) were retired from the OpenAI
  API in 2023. There is no Codex model to call.
- The current product named "Codex" (Codex CLI / Codex cloud agent) is an
  agentic coding product. Authentication runs through ChatGPT account
  sign-in; it is not exposed as a completion API for third-party
  applications to embed.
- Everything OpenAI does expose programmatically (GPT-4o, o-series, etc.)
  goes through the standard OpenAI API — which the plugin already supports
  via the OpenAI-compatible provider (S1-03). A separate "Codex provider"
  would add nothing.

**Verdict: no-go.** FR-014 satisfied via its feasibility clause; users who
want OpenAI models configure the OpenAI-compatible provider with
`https://api.openai.com/v1`.

## GitHub Copilot (FR-015, EIR-010, OP-003)

- GitHub offers no public API for Copilot completions or Copilot Chat.
  Official surfaces are the IDE extensions, the CLI, and GitHub-hosted
  features (e.g. Copilot Extensions run *inside* GitHub's ecosystem and
  cannot serve as a completion backend for an external desktop app).
- Community projects reach Copilot by impersonating the editor plugin:
  device-flow OAuth to obtain a Copilot token, then calls against the
  internal completion endpoint. This is unofficial, breaks without notice,
  and GitHub's Terms of Service prohibit accessing the service by means
  other than the official interfaces. Shipping this in a plugin would put
  users' GitHub accounts at risk of suspension.
- Auth mechanism (for the record): GitHub device flow → short-lived Copilot
  bearer token → internal API. Effort would be S-M to prototype, but the ToS
  problem is disqualifying regardless of effort.

**Verdict: no-go.** FR-015 marked "not technically feasible" (ToS, no public
API). Revisit only if GitHub ships an official Copilot API for third-party
applications.

## Consequences

- FR-014/FR-015: documented as not technically feasible per their own
  escape-hatch wording; requirements considered addressed by this record.
- ASM-004 corrected: the assumption held only for providers with public
  APIs; those are all reachable through the OpenAI-compatible abstraction.
- Sprint 5 stretch item S5-08 is **not** created.
- Local models (FR-016, EIR-011) are unaffected: Ollama, LM Studio and vLLM
  all speak the OpenAI-compatible dialect and work with the S1-03 provider.
