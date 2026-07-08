/** Predefined prompt templates for scholarly analysis (FR-080, FR-082..FR-088).
 * Pure module. Free-form prompts (FR-081) are composed by the workflow layer. */

export interface PromptTemplate {
  id: string;
  label: string;
  /** Default scholarly category this template maps to, if any. */
  category?: string;
  /** Prompt body; {{context}} is replaced with retrieved paper content. */
  template: string;
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: "methodology",
    label: "Extract methodology",
    category: "methodology",
    template:
      "Extract and summarize the methodology of the following paper content. " +
      "Describe study design, methods, and procedures.\n\n{{context}}",
  },
  {
    id: "results",
    label: "Summarize results",
    category: "results",
    template:
      "Summarize the key results and findings of the following paper content.\n\n{{context}}",
  },
  {
    id: "literature",
    label: "Related work context",
    category: "literature",
    template:
      "Summarize the related work and literature context referenced in the " +
      "following paper content.\n\n{{context}}",
  },
  {
    id: "limitations",
    label: "Extract limitations",
    category: "limitations",
    template:
      "Identify and summarize the limitations stated or implied in the " +
      "following paper content.\n\n{{context}}",
  },
  {
    id: "research-question",
    label: "Extract research question",
    category: "research question",
    template:
      "Identify the research question(s) or hypotheses addressed in the " +
      "following paper content.\n\n{{context}}",
  },
  {
    id: "data",
    label: "Describe data",
    category: "data",
    template:
      "Describe the datasets, data sources, and data collection described in " +
      "the following paper content.\n\n{{context}}",
  },
  {
    id: "open-points",
    label: "Problems and open points",
    category: "open points",
    template:
      "Identify open problems, unanswered questions, and future work mentioned " +
      "in the following paper content.\n\n{{context}}",
  },
];

export function getTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

/** Render a template body by substituting {{context}}. */
export function renderTemplate(template: PromptTemplate, context: string): string {
  return template.template.replaceAll("{{context}}", context);
}
