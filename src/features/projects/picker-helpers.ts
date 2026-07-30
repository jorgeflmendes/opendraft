import type { ProjectSummary } from "@/domain";

export function filterSummaries(
  summaries: readonly ProjectSummary[],
  query: string,
): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...summaries];
  return summaries.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

export function mostRecent(summaries: readonly ProjectSummary[]): ProjectSummary | null {
  if (summaries.length === 0) return null;
  let best = summaries[0]!;
  for (const s of summaries) {
    if (s.lastOpenedAt > best.lastOpenedAt) best = s;
  }
  return best;
}
