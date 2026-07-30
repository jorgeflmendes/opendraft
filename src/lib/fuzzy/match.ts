// Ordered-subsequence matcher with boosts for adjacency, word boundaries, exact
// case, and compact candidates. Match indices also drive result highlighting.

export interface FuzzyMatch {
  score: number;
  indices: number[];
}

const SEPARATOR_RE = /[/\\.\-_\s]/;

export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 1, indices: [] };
  if (candidate.length < query.length) return null;
  const lcQuery = query.toLowerCase();
  const lcCandidate = candidate.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let candidateIndex = 0;
  let lastMatchIndex = -2;
  for (let qi = 0; qi < lcQuery.length; qi++) {
    const ch = lcQuery[qi]!;
    let found = -1;
    while (candidateIndex < lcCandidate.length) {
      if (lcCandidate[candidateIndex] === ch) {
        found = candidateIndex;
        break;
      }
      candidateIndex++;
    }
    if (found === -1) return null;
    let stepScore = 1;
    // Consecutive-match boost.
    if (found === lastMatchIndex + 1) stepScore += 3;
    // Word-boundary boost: start of string, or the char before is a
    // separator.
    if (found === 0 || SEPARATOR_RE.test(candidate[found - 1] ?? "")) stepScore += 2;
    // Exact-case match (when caller passed mixed case) bumps the
    // score so 'FT' inside FileTree.tsx beats 'ft' inside footer.tsx.
    if (candidate[found] === query[qi]) stepScore += 1;
    score += stepScore;
    indices.push(found);
    lastMatchIndex = found;
    candidateIndex = found + 1;
  }
  // Penalty for leftover candidate length so shorter candidates
  // beat longer ones with the same match shape.
  score -= candidate.length * 0.05;
  // Tiny boost when the match is densely packed (last match minus
  // first is close to the query length).
  const span = (indices[indices.length - 1] ?? 0) - (indices[0] ?? 0) + 1;
  score += Math.max(0, lcQuery.length / span);

  score = Math.max(0.001, score);

  return { score, indices };
}

export interface RankedItem<T> {
  item: T;
  match: FuzzyMatch;
}

/**
 * Rank a list of items by their fuzzy match against `query`. Items
 * with no match are dropped. Returns a fresh array - does not
 * mutate `items`.
 */
export function rankByFuzzy<T>(
  items: readonly T[],
  query: string,
  getString: (item: T) => string,
): RankedItem<T>[] {
  if (query.length === 0) {
    return items.map((item) => ({ item, match: { score: 0, indices: [] } }));
  }
  const out: RankedItem<T>[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getString(item));
    if (match) out.push({ item, match });
  }
  out.sort((a, b) => b.match.score - a.match.score);
  return out;
}
