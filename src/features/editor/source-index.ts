import { activeFileEntries, type Project } from "@/domain";

export function collectTextSources(
  project: Project,
  edits: Record<string, string> | undefined,
  includePath: (path: string) => boolean,
): Map<string, string> {
  const sources = new Map<string, string>();
  const paths = activeFileEntries(project)
    .map(([path]) => path)
    .filter(includePath)
    .sort();
  for (const path of paths) {
    const source = edits?.[path] ?? project.files[path]?.content;
    if (typeof source === "string") sources.set(path, source);
  }
  return sources;
}

export function sameTextSources(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [path, source] of left) {
    if (right.get(path) !== source) return false;
  }
  return true;
}
