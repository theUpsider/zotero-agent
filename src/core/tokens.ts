/** Token-budget heuristic (S3-05, NFR-004). No tokenizer ships in the bundle
 * (bundle-size and offline concerns); chars/4 is the standard rough estimate
 * for English scholarly prose and is good enough for a soft budget — the
 * consequence of misestimating is a slightly over/under-full context, not a
 * correctness bug. */
const CHARS_PER_TOKEN = 4;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tokenBudgetToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}
