import { getFileExtension } from "./path-utils";

const TEXT_PROJECT_EXTENSIONS = new Set([
  "tex",
  "ltx",
  "sty",
  "cls",
  "clo",
  "def",
  "cfg",
  "fd",
  "bib",
  "bst",
  "bbx",
  "cbx",
  "lbx",
  "ist",
  "md",
  "makefile",
  "license",
  "dockerfile",
  "gitignore",
  "editorconfig",
  "env",
  "txt",
  "yml",
  "yaml",
  "json",
  "csv",
  "tsv",
  "xml",
]);

export function isTextProjectPath(path: string): boolean {
  return TEXT_PROJECT_EXTENSIONS.has(getFileExtension(path));
}
