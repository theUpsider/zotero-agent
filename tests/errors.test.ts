import { describe, expect, it } from "vitest";
import {
  AgentError,
  AuthenticationError,
  InvalidConfigError,
  ModelNotFoundError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  createLogger,
  redact,
  toUserMessage,
  type LogSink,
} from "../src/core/errors";

describe("typed errors", () => {
  it("subclasses carry their fixed code and are AgentErrors", () => {
    const cases: [AgentError, string][] = [
      [new InvalidConfigError("x"), "invalid-config"],
      [new ProviderUnavailableError("x"), "provider-unavailable"],
      [new AuthenticationError("x"), "auth-failed"],
      [new ModelNotFoundError("x"), "model-not-found"],
      [new ProviderResponseError("x"), "provider-response"],
      [new ProviderTimeoutError("x"), "provider-timeout"],
    ];
    for (const [error, code] of cases) {
      expect(error).toBeInstanceOf(AgentError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
    }
  });

  it("preserves cause", () => {
    const cause = new Error("socket hang up");
    const error = new ProviderUnavailableError("unreachable", { cause });
    expect(error.cause).toBe(cause);
  });
});

describe("toUserMessage", () => {
  it("maps every code to a plain-language message", () => {
    expect(toUserMessage(new InvalidConfigError(""))).toMatch(/not fully configured/i);
    expect(toUserMessage(new ProviderUnavailableError("x"))).toMatch(/could not reach/i);
    expect(toUserMessage(new AuthenticationError("x"))).toMatch(/rejected the api key/i);
    expect(toUserMessage(new ModelNotFoundError(""))).toMatch(/model.*not found/i);
    expect(toUserMessage(new ProviderResponseError("x"))).toMatch(/unexpected response/i);
    expect(toUserMessage(new ProviderTimeoutError("x"))).toMatch(/timed out/i);
  });

  it("uses the specific message for config and model errors when present", () => {
    expect(toUserMessage(new ModelNotFoundError("The model 'llama3' was not found on this endpoint."))).toContain("llama3");
  });

  it("maps unknown errors to a generic message without internals", () => {
    const message = toUserMessage(new Error("ECONNREFUSED at TCPConnectWrap"));
    expect(message).not.toContain("ECONNREFUSED");
    expect(message).toMatch(/something went wrong/i);
  });
});

describe("redact", () => {
  it("masks secrets and their URL-encoded forms", () => {
    const secret = "sk-abc/123+x";
    const text = `Bearer ${secret} url=?key=${encodeURIComponent(secret)}`;
    const out = redact(text, [secret]);
    expect(out).not.toContain(secret);
    expect(out).not.toContain(encodeURIComponent(secret));
  });

  it("ignores empty secrets", () => {
    expect(redact("hello", [""])).toBe("hello");
  });
});

describe("createLogger", () => {
  function capture(): { sink: LogSink; lines: string[] } {
    const lines: string[] = [];
    return { sink: { debug: (m) => lines.push(m) }, lines };
  }

  it("prefixes all output with [zotero-agent]", () => {
    const { sink, lines } = capture();
    createLogger(sink).log("hello");
    expect(lines[0]).toMatch(/^\[zotero-agent\] hello$/);
  });

  it("never emits an unredacted secret (NFR-012)", () => {
    const { sink, lines } = capture();
    const logger = createLogger(sink, () => ["sk-secret-key"]);
    logger.log("request failed: Authorization: Bearer sk-secret-key");
    logger.error("boom", new Error("401 body echoed sk-secret-key"));
    for (const line of lines) {
      expect(line).not.toContain("sk-secret-key");
    }
  });
});
