// Public surface of the domain layer. Consumers should import from
// "@/domain" rather than the individual files so we can rearrange
// the internals (split files, add modules) without churn.
export type { FileKind, FileNode, ProjectFolder, Project, ProjectSummary } from "./project";
export {
  isTextContent,
  isBinaryContent,
  isActiveFile,
  activeFileEntries,
  activeFilePaths,
} from "./project";
export type { CompileStatus, CompileResult, LogEntry } from "./compile";
export { uniqueCompileIssues } from "./compile";
