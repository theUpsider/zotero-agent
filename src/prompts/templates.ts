/** Predefined prompt templates for scholarly analysis (FR-080, FR-082..FR-088).
 * Pure module. Free-form prompts (FR-081) are composed by the workflow layer.
 *
 * System prompt: role + formatting instructions sent as a system message.
 * Template: the user-facing task directive + `{{context}}` (paper content). */

export interface PromptTemplate {
  id: string;
  label: string;
  /** Default scholarly category this template maps to, if any. */
  category?: string;
  /** System prompt sent as the model's role and formatting instructions. */
  systemPrompt: string;
  /** User-facing prompt body; {{context}} is replaced with retrieved paper content. */
  template: string;
  /** One-line topical query used as the retrieval query text (S3-05) when the
   * item's PDF text exceeds the token budget; falls back to `label` if unset. */
  retrievalHint?: string;
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: "methodology",
    label: "Extract methodology",
    category: "methodology",
    systemPrompt:
      "You are a research methodology analyst. Extract and describe the study design, methods, " +
      "and procedures from academic papers. Write a concise, well-structured Markdown response " +
      "using level-2 headings. Use only information from the provided content — do not invent data " +
      "or speculate beyond what the paper reports.",
    template: "Extract the methodology from this paper.\n\n{{context}}",
    retrievalHint: "study design, methods, and procedures",
  },
  {
    id: "results",
    label: "Summarize results",
    category: "results",
    systemPrompt:
      "You are a research results summarizer. Identify and concisely summarize the key results and " +
      "findings from academic papers. Write in well-structured Markdown with level-2 headings. " +
      "Use only the provided content — do not invent or extrapolate findings.",
    template: "Summarize the key results from this paper.\n\n{{context}}",
    retrievalHint: "key results and findings",
  },
  {
    id: "literature",
    label: "Related work context",
    category: "literature",
    systemPrompt:
      "You are a literature analyst. Identify and summarize the related work, prior research, and " +
      "literature context referenced in academic papers. Write in well-structured Markdown with " +
      "level-2 headings. Use only the provided content — do not add references the paper does not cite.",
    template:
      "Summarize the related work and literature context from this paper.\n\n{{context}}",
    retrievalHint: "related work and literature context",
  },
  {
    id: "limitations",
    label: "Extract limitations",
    category: "limitations",
    systemPrompt:
      "You are a critical review analyst. Identify and explain the limitations stated or implied " +
      "in academic papers. Write in well-structured Markdown with level-2 headings. Use only the " +
      "provided content — do not invent limitations the paper does not acknowledge or imply.",
    template: "Identify the limitations from this paper.\n\n{{context}}",
    retrievalHint: "limitations",
  },
  {
    id: "research-question",
    label: "Extract research question",
    category: "research question",
    systemPrompt:
      "You are a research design analyst. Identify the research questions or hypotheses addressed " +
      "in academic papers. Write in well-structured Markdown with level-2 headings. Use only the " +
      "provided content — do not infer questions the paper does not state.",
    template: "Identify the research question from this paper.\n\n{{context}}",
    retrievalHint: "research question or hypotheses",
  },
  {
    id: "data",
    label: "Describe data",
    category: "data",
    systemPrompt:
      "You are a data analyst. Describe the datasets, data sources, and data collection methods " +
      "described in academic papers. Write in well-structured Markdown with level-2 headings. " +
      "Use only the provided content — do not fabricate datasets or sources.",
    template:
      "Describe the data sources and datasets from this paper.\n\n{{context}}",
    retrievalHint: "datasets, data sources, and data collection",
  },
  {
    id: "open-points",
    label: "Problems and open points",
    category: "open points",
    systemPrompt:
      "You are a research forecaster. Identify open problems, unanswered questions, and future " +
      "work directions mentioned in academic papers. Write in well-structured Markdown with " +
      "level-2 headings. Use only the provided content — do not invent future directions.",
    template:
      "Identify open problems and future work from this paper.\n\n{{context}}",
    retrievalHint: "open problems, unanswered questions, and future work",
  },
];

export function getTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

/** Render a template body by substituting {{context}}. */
export function renderTemplate(
  template: PromptTemplate,
  context: string,
): string {
  return template.template.replaceAll("{{context}}", context);
}
