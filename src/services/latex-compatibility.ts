import { activeFilePaths, type LogEntry, type Project } from "@/domain";
import type { AuxiliaryToolKind } from "./latex-auxiliary-tools";
import { getFileExtension, basename, dirname } from "./path-utils";

export interface LatexCompatibilityIssue extends LogEntry {
  tool: AuxiliaryToolKind;
}

export interface LatexServerlessCapabilities {
  xetex: boolean;
  luatex: boolean;
  bibtex: boolean;
  biber: boolean;
  makeindex: boolean;
}

interface SourceFile {
  path: string;
  content: string;
}

const XETEX_PACKAGES = new Set(["fontspec", "unicode-math", "polyglossia", "xltxtra"]);
const LUATEX_PACKAGES = new Set(["luacode", "luaotfload", "luatexbase", "luatexja", "luatex85"]);
const SHELL_PACKAGES = new Set(["gnuplottex", "sagetex", "asymptote"]);
const TEXT_LIKE_EXTENSIONS = new Set([
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
]);
const PACKAGE_RE = /\\(?:usepackage|RequirePackage)(?:\s*\[([^\]]*)])?\s*\{([^}]+)\}/gi;

export const SWIFTLATEX_CAPABILITIES: LatexServerlessCapabilities = {
  xetex: false,
  luatex: false,
  bibtex: false,
  biber: false,
  makeindex: false,
};

export const BUSYTEX_CAPABILITIES: LatexServerlessCapabilities = {
  xetex: true,
  luatex: true,
  bibtex: true,
  biber: false,
  makeindex: true,
};

export function analyseServerlessCompatibility(
  project: Project,
  edits: Record<string, string> | undefined,
  capabilities: LatexServerlessCapabilities = SWIFTLATEX_CAPABILITIES,
): LatexCompatibilityIssue[] {
  const issues: LatexCompatibilityIssue[] = [];
  const files = effectiveTextFiles(project, edits);
  const entryStem = stripExtension(project.entry);
  const projectPaths = effectiveProjectPaths(project);
  const entry = files.find((file) => file.path === project.entry);

  // Editor magic comments only select the engine for the root document.
  // A vendored class/chapter must not unexpectedly change or block it.
  if (entry) scanProgramMagic(entry, issues, capabilities);

  for (const file of files) {
    scanPackages(file, issues, capabilities, projectPaths, entryStem);
    scanExternalCommands(file, issues, projectPaths, entryStem);
  }

  if (entry) {
    if (
      !capabilities.makeindex &&
      usesMakeIndex(entry.content) &&
      !projectPaths.has(`${entryStem}.ind`)
    ) {
      issues.push({
        level: "error",
        filePath: entry.path,
        line: lineOf(entry.content, /\\(?:makeindex|printindex)\b/),
        message:
          "This project needs MakeIndex, but no browser/WASM MakeIndex runtime is bundled yet.",
        tool: "makeindex",
      });
    }
  }

  return issues;
}

function effectiveTextFiles(
  project: Project,
  edits: Record<string, string> | undefined,
): SourceFile[] {
  const paths = new Set(activeFilePaths(project, edits));
  return [...paths].filter(textLikePath).map((path) => {
    const original = project.files[path]?.content;
    return {
      path,
      content: edits?.[path] ?? (typeof original === "string" ? original : ""),
    };
  });
}

function effectiveProjectPaths(project: Project): Set<string> {
  return new Set(activeFilePaths(project));
}

function textLikePath(path: string): boolean {
  const ext = getFileExtension(path);
  return TEXT_LIKE_EXTENSIONS.has(ext);
}

function scanProgramMagic(
  file: SourceFile,
  issues: LatexCompatibilityIssue[],
  capabilities: LatexServerlessCapabilities,
): void {
  // Magic comments are only valid near the top of the file.
  const head = file.content.split("\n", 20).join("\n");
  const m = /^%\s*!TEX\s+(?:TS-)?program\s*=\s*(xelatex|xetex|lualatex|luatex)\b/im.exec(head);
  if (!m) return;

  const program = m[1]!.toLowerCase();
  const tool = program === "xelatex" || program === "xetex" ? "xetex" : "luatex";
  if ((tool === "xetex" && capabilities.xetex) || (tool === "luatex" && capabilities.luatex)) {
    return;
  }
  issues.push({
    level: "error",
    filePath: file.path,
    line: lineOf(head, /^%\s*!TEX\s+(?:TS-)?program\s*=/im),
    message: `${program} is requested, but the active serverless engine cannot run it.`,
    tool,
  });
}

function scanPackages(
  file: SourceFile,
  issues: LatexCompatibilityIssue[],
  capabilities: LatexServerlessCapabilities,
  projectPaths: Set<string>,
  entryStem: string,
): void {
  for (const match of file.content.matchAll(PACKAGE_RE)) {
    const options = match[1] ?? "";
    const packages = match[2]!.split(",").map((name) => name.trim().toLowerCase());
    for (const pkg of packages) {
      if (XETEX_PACKAGES.has(pkg)) {
        if (capabilities.xetex || capabilities.luatex) continue;
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message: `${pkg} requires XeLaTeX or LuaLaTeX; the serverless engine currently runs pdfTeX.`,
          tool: pkg === "fontspec" || pkg === "xltxtra" ? "xetex" : "luatex",
        });
      } else if (LUATEX_PACKAGES.has(pkg)) {
        if (capabilities.luatex) continue;
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message: `${pkg} requires LuaLaTeX; the active serverless engine cannot run it.`,
          tool: "luatex",
        });
      } else if (pkg === "minted") {
        if (mintedCanUseFrozenCache(options, projectPaths, entryStem)) continue;
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message:
            "minted needs shell-escape/Python unless the project includes a frozen minted cache.",
          tool: "shell-escape",
        });
      } else if (SHELL_PACKAGES.has(pkg)) {
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message: `${pkg} requires shell-escape or an external program, which is not allowed serverlessly.`,
          tool: "shell-escape",
        });
      } else if (pkg === "pythontex") {
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message:
            "pythontex requires Python execution; a browser Python runtime is not bundled yet.",
          tool: "pythontex",
        });
      } else if (pkg === "svg") {
        if (svgCanUsePreconvertedFiles(file, options, projectPaths)) continue;
        if (!/\\includesvg(?:\s*\[[^\]]*])?\s*\{/i.test(file.content)) continue;
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message:
            "The svg package needs a preconverted PDF/PDF_TEX companion or an external converter.",
          tool: "svg-converter",
        });
      } else if (pkg === "biblatex") {
        if (capabilities.biber) continue;
        if (/\bbackend\s*=\s*none\b/i.test(options)) continue;
        if (capabilities.bibtex && /\bbackend\s*=\s*bibtex8?\b/i.test(options)) continue;
        if (projectPaths.has(`${entryStem}.bbl`)) continue;
        issues.push({
          level: "error",
          filePath: file.path,
          line: lineOfIndex(file.content, match.index),
          message: "biblatex defaults to biber, and no browser/WASM biber runtime is bundled yet.",
          tool: "biber",
        });
      }
    }
  }
}

function scanExternalCommands(
  file: SourceFile,
  issues: LatexCompatibilityIssue[],
  projectPaths: Set<string>,
  entryStem: string,
): void {
  const shell = /\\(?:immediate\s*)?write18\b/.exec(file.content);
  if (shell) {
    issues.push({
      level: "error",
      filePath: file.path,
      line: lineOfIndex(file.content, shell.index),
      message: "\\write18 shell execution is blocked in serverless browser compilation.",
      tool: "shell-escape",
    });
  }
  const glossaries =
    /\\(?:makeglossaries|makexindyglossaries|printglossary|printglossaries)\b/.exec(file.content);
  if (
    glossaries &&
    !glossariesCanRunWithoutExternalIndexer(file.content, projectPaths, entryStem)
  ) {
    issues.push({
      level: "error",
      filePath: file.path,
      line: lineOfIndex(file.content, glossaries.index),
      message:
        "Glossary generation needs makeglossaries/xindy unless the project uses no-index glossaries or includes generated glossary files.",
      tool: "makeglossaries",
    });
  }
}

function mintedCanUseFrozenCache(
  options: string,
  projectPaths: ReadonlySet<string>,
  entryStem: string,
): boolean {
  if (!/\bfrozencache\b/i.test(options)) return false;
  const cachePrefix = `_minted-${basename(entryStem)}/`;
  return [...projectPaths].some((path) => {
    const lower = path.toLowerCase();
    return lower.startsWith(cachePrefix.toLowerCase()) && /\.(pygtex|pygstyle)$/.test(lower);
  });
}

function svgCanUsePreconvertedFiles(
  file: SourceFile,
  packageOptions: string,
  projectPaths: ReadonlySet<string>,
): boolean {
  if (/\binkscape\s*=\s*(?:false|none|0)\b/i.test(packageOptions)) return true;
  const includes = [...file.content.matchAll(/\\includesvg(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi)];
  if (includes.length === 0) return true;
  return includes.every((match) => {
    const base = stripSvgExtension(normalizeRelativePath(dirname(file.path), match[1]!.trim()));
    return hasSvgCompanion(base, projectPaths);
  });
}

function hasSvgCompanion(base: string, projectPaths: ReadonlySet<string>): boolean {
  const name = basename(base);
  const dir = dirname(base);
  const generatedStem = dir
    ? `${dir}/svg-inkscape/${name}_svg-tex`
    : `svg-inkscape/${name}_svg-tex`;
  return (
    projectPaths.has(`${base}.pdf`) ||
    projectPaths.has(`${base}.pdf_tex`) ||
    projectPaths.has(`${generatedStem}.pdf`) ||
    projectPaths.has(`${generatedStem}.pdf_tex`)
  );
}

function glossariesCanRunWithoutExternalIndexer(
  content: string,
  projectPaths: ReadonlySet<string>,
  entryStem: string,
): boolean {
  if (/\\(?:makenoidxglossaries|printnoidxglossary)\b/i.test(content)) return true;
  return ["gls", "glg", "glsdefs"].some((ext) => projectPaths.has(`${entryStem}.${ext}`));
}

function usesMakeIndex(content: string): boolean {
  return /\\(?:makeindex|printindex)\b/.test(content);
}

function stripExtension(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? path : path.slice(0, i);
}

function stripSvgExtension(path: string): string {
  return path.toLowerCase().endsWith(".svg") ? path.slice(0, -4) : path;
}

function normalizeRelativePath(fromDir: string, raw: string): string {
  const parts = [...(fromDir ? fromDir.split("/") : []), ...raw.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function lineOf(content: string, pattern: RegExp): number {
  const m = pattern.exec(content);
  return m ? lineOfIndex(content, m.index) : 1;
}

function lineOfIndex(content: string, index: number | undefined): number {
  if (index === undefined) return 1;
  return content.slice(0, index).split("\n").length;
}
