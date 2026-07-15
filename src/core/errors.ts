/** Typed errors, user-facing message mapping, secret redaction, and namespaced
 * logging (S1-09, EIR-014, NFR-012). Pure — the Zotero-bound log sink is
 * injected by plugin glue. */

export type ErrorCode =
  | "invalid-config"
  | "provider-unavailable"
  | "provider-timeout"
  | "auth-failed"
  | "model-not-found"
  | "provider-response"
  | "unknown";

export class AgentError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidConfigError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("invalid-config", message, options);
  }
}

export class ProviderUnavailableError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("provider-unavailable", message, options);
  }
}

export class ProviderTimeoutError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("provider-timeout", message, options);
  }
}

export class AuthenticationError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("auth-failed", message, options);
  }
}

export class ModelNotFoundError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("model-not-found", message, options);
  }
}

export class ProviderResponseError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("provider-response", message, options);
  }
}

/** Map any error to a plain-language message safe to show in the UI
 * (EIR-014, NFR-013). Never includes stack traces or secrets. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AgentError) {
    switch (error.code) {
      case "invalid-config":
        return error.message !== ""
          ? error.message
          : "The provider is not fully configured. Enter an endpoint URL and model in the settings.";
      case "provider-unavailable":
        return "Could not reach the AI service. Check the endpoint URL and your internet connection.";
      case "provider-timeout":
        return "The AI request timed out before the model finished. Increase the provider request timeout or use a faster model.";
      case "auth-failed":
        return "The AI service rejected the API key. Check the key in the settings.";
      case "model-not-found":
        return error.message !== ""
          ? error.message
          : "The configured model was not found on this endpoint.";
      case "provider-response":
      case "unknown":
        return "The AI service returned an unexpected response.";
    }
  }
  return "Something went wrong. See the debug log for details.";
}

const MASK = "•••";

/** Replace every occurrence of each secret (and its URL-encoded form) with a
 * mask. Empty secrets are ignored. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret === "") continue;
    out = out.split(secret).join(MASK);
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) out = out.split(encoded).join(MASK);
  }
  return out;
}

export interface LogSink {
  debug(message: string): void;
}

export interface Logger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

const LOG_PREFIX = "[zotero-agent]";

/** Logger that prefixes every line and redacts current secrets on every
 * write, so credentials can never leak into the debug log (NFR-012). */
export function createLogger(
  sink: LogSink,
  secrets: () => readonly string[] = () => [],
): Logger {
  const write = (message: string) => {
    sink.debug(`${LOG_PREFIX} ${redact(message, secrets())}`);
  };
  return {
    log: write,
    error: (message, error) => {
      let detail = error instanceof Error ? `${message}: ${error.message}` : message;
      if (error instanceof Error && error.cause instanceof Error) {
        detail += ` (cause: ${error.cause.message})`;
      }
      write(detail);
    },
  };
}

export const noopLogger: Logger = {
  log: () => {},
  error: () => {},
};
