import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../src/core/colorSemantics";
import {
  PROMPT_TEMPLATES,
  getTemplate,
  renderTemplate,
} from "../src/prompts/templates";

describe("PROMPT_TEMPLATES", () => {
  it("provides one template per default scholarly category (FR-082..FR-088)", () => {
    const covered = new Set(PROMPT_TEMPLATES.map((t) => t.category));
    for (const category of DEFAULT_CATEGORIES) {
      expect(covered).toContain(category);
    }
  });

  it("has unique ids and a {{context}} placeholder in every body", () => {
    const ids = PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of PROMPT_TEMPLATES) {
      expect(template.template).toContain("{{context}}");
    }
  });

  it("has a non-empty systemPrompt on every template", () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.systemPrompt).toBeTruthy();
      expect(template.systemPrompt.length).toBeGreaterThan(50);
    }
  });

  it("keeps template bodies concise (instructions moved to system prompt)", () => {
    for (const template of PROMPT_TEMPLATES) {
      // Template should be a short instruction + placeholder, not a paragraph.
      expect(template.template.length).toBeLessThan(150);
    }
  });
});

describe("getTemplate / renderTemplate", () => {
  it("finds a template by id and substitutes context", () => {
    const template = getTemplate("methodology");
    expect(template).toBeDefined();
    const rendered = renderTemplate(template!, "PAPER TEXT");
    expect(rendered).toContain("PAPER TEXT");
    expect(rendered).not.toContain("{{context}}");
  });

  it("returns undefined for unknown ids", () => {
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });
});
