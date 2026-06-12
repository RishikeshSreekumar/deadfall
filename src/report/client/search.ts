// Pure fuzzy matcher for the component search palette. No DOM — unit-testable.
// Scoring favours exact substrings (earlier = better), then subsequence matches
// with fewer/smaller gaps, then shorter targets, so e.g. "btn" finds Button
// before AbstractButtonWrapper.

export interface Searchable {
  id: string;
  name: string;
}

export interface SearchHit {
  id: string;
  name: string;
  score: number;
}

/** Match score for `query` against `target` (case-insensitive); -1 = no match. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return -1;

  const sub = t.indexOf(q);
  if (sub >= 0) {
    // Exact substring: prefer matches at the start and in shorter names.
    return 1000 - sub * 4 - (t.length - q.length);
  }

  // Subsequence: every query char must appear in order; gaps cost.
  let ti = 0;
  let gaps = 0;
  let lastHit = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found < 0) return -1;
    if (lastHit >= 0 && found > lastHit + 1) gaps += found - lastHit - 1;
    lastHit = found;
    ti = found + 1;
  }
  return 500 - gaps * 8 - (t.length - q.length);
}

/** Top `limit` matches sorted by score desc, then name for determinism. */
export function searchComponents(query: string, items: ReadonlyArray<Searchable>, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const it of items) {
    const score = fuzzyScore(query, it.name);
    if (score >= 0) hits.push({ id: it.id, name: it.name, score });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}
