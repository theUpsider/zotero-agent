/** Relevance refinement hook (S3-04, FR-071). A simple score-fusion pass is
 * the first version; the hook shape lets a future cross-encoder or
 * learned reranker slot in without touching the backend or callers. */

import type { RetrievalQuery, RetrievalResult } from "./types";

export type Reranker = (query: RetrievalQuery, results: RetrievalResult[]) => RetrievalResult[];

/** annotation/note chunks are user-curated signal worth a small boost; an
 * exact-phrase hit is worth another. Scores are min-max normalized first so
 * the boosts behave consistently across fulltext/vector/hybrid score scales. */
export const defaultReranker: Reranker = (query, results) => {
  if (results.length === 0) return results;

  const scores = results.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  const normalize = (score: number) => (range > 0 ? (score - min) / range : 1);

  const needle = query.text.trim().toLowerCase();
  const boosted = results.map((result) => {
    let score = normalize(result.score);
    if (result.chunk.source === "annotation" || result.chunk.source === "note") score *= 1.15;
    if (needle && result.chunk.text.toLowerCase().includes(needle)) score *= 1.1;
    return { chunk: result.chunk, score };
  });

  return boosted.sort((a, b) => b.score - a.score);
};
