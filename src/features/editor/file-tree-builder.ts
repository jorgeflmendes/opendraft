import { activeFileEntries, type FileNode, type Project } from "@/domain";

// Build a recursive tree from a Project's flat path-keyed files and
// folders. Pure function, no React - easier to test and reason about,
// and lets the FileTree component stay a thin renderer.

export type TreeNode =
  | { type: "folder"; path: string; name: string; expanded: boolean; children: TreeNode[] }
  | { type: "file"; path: string; name: string; file: FileNode };

/**
 * Materialise the tree. Folders declared in project.folders appear
 * even when empty (representable empty dirs). Files are nested into
 * their parent folder by path, creating intermediate folder nodes
 * for any path segment that wasn't pre-declared. Children are sorted
 * folders-first, then case-insensitive name.
 */
export function buildFileTree(project: Project): TreeNode[] {
  const folderIndex = new Map<string, Extract<TreeNode, { type: "folder" }>>();
  const roots: TreeNode[] = [];

  const ensureFolder = (
    folderPath: string,
    expanded: boolean,
  ): Extract<TreeNode, { type: "folder" }> => {
    const existing = folderIndex.get(folderPath);
    if (existing) {
      // OR-merge: explicit declaration wins over implicit-from-file.
      if (expanded) existing.expanded = true;
      return existing;
    }
    const parts = folderPath.split("/");
    const name = parts[parts.length - 1] ?? folderPath;
    const node: Extract<TreeNode, { type: "folder" }> = {
      type: "folder",
      path: folderPath,
      name,
      expanded,
      children: [],
    };
    folderIndex.set(folderPath, node);
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath, false);
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  // 1) Pre-declared folders (so empty ones still appear in the tree).
  for (const folder of Object.values(project.folders)) {
    ensureFolder(folder.path, folder.expanded ?? false);
  }

  // 2) Files, attached under their parent folder (creating it lazily).
  for (const [, file] of activeFileEntries(project)) {
    const segments = file.path.split("/");
    const fileNode: TreeNode = {
      type: "file",
      path: file.path,
      name: segments[segments.length - 1] ?? file.path,
      file,
    };
    if (segments.length > 1) {
      const parentPath = segments.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath, false);
      parent.children.push(fileNode);
    } else {
      roots.push(fileNode);
    }
  }

  // 3) Sort: folders first, then case-insensitive name.
  const sortChildren = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    for (const n of nodes) {
      if (n.type === "folder") sortChildren(n.children);
    }
  };
  sortChildren(roots);

  return roots;
}
