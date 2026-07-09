import { describe, expect, it } from "vitest";
import { escapeHtml, markdownToHtml } from "../src/core/markdown";

describe("escapeHtml", () => {
  it("escapes markup-relevant characters", () => {
    expect(escapeHtml(`<script>alert("&")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;&amp;&quot;)&lt;/script&gt;",
    );
  });
});

describe("markdownToHtml", () => {
  it("renders headings at all levels", () => {
    expect(markdownToHtml("# Title")).toBe("<h1>Title</h1>");
    expect(markdownToHtml("### Sub")).toBe("<h3>Sub</h3>");
    expect(markdownToHtml("###### Deep")).toBe("<h6>Deep</h6>");
  });

  it("renders paragraphs, joining wrapped lines", () => {
    expect(markdownToHtml("one\ntwo\n\nthree")).toBe("<p>one two</p>\n<p>three</p>");
  });

  it("renders unordered lists", () => {
    expect(markdownToHtml("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(markdownToHtml("* a")).toBe("<ul>\n<li>a</li>\n</ul>");
  });

  it("renders ordered lists", () => {
    expect(markdownToHtml("1. a\n2. b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
  });

  it("closes a list when a paragraph follows", () => {
    expect(markdownToHtml("- a\n\ntext")).toBe("<ul>\n<li>a</li>\n</ul>\n<p>text</p>");
  });

  it("renders bold, italic, and inline code", () => {
    expect(markdownToHtml("**b** and *i* and `c`")).toBe(
      "<p><strong>b</strong> and <em>i</em> and <code>c</code></p>",
    );
  });

  it("does not treat bold markers as italic", () => {
    expect(markdownToHtml("**only bold**")).toBe("<p><strong>only bold</strong></p>");
  });

  it("renders fenced code blocks verbatim (escaped)", () => {
    expect(markdownToHtml("```\nconst x = 1 < 2;\n```")).toBe(
      "<pre><code>\nconst x = 1 &lt; 2;\n</code></pre>",
    );
  });

  it("closes an unterminated code block", () => {
    expect(markdownToHtml("```\ncode")).toBe("<pre><code>\ncode\n</code></pre>");
  });

  it("renders horizontal rules", () => {
    expect(markdownToHtml("a\n\n---\n\nb")).toBe("<p>a</p>\n<hr/>\n<p>b</p>");
  });

  it("escapes raw HTML in model output", () => {
    const html = markdownToHtml(`<img src=x onerror="alert(1)">`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("handles empty input", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("\n\n")).toBe("");
  });
});
