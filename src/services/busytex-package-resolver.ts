import type { TexliveRemoteFile } from "texlyre-busytex";
import { activeFilePaths, type Project } from "@/domain";
import { CtanFetcher, type CtanFile } from "./ctan-fetcher";

export interface BusyTexRuntimeFileResolver {
  resolveDeclared(
    project: Project,
    edits: Record<string, string> | undefined,
  ): Promise<TexliveRemoteFile[]>;
  resolveMissing(rawLog: string): Promise<TexliveRemoteFile[]>;
}

export interface BusyTexPackageResolverOptions {
  busytexBasePath?: string;
  fetcher?: Pick<CtanFetcher, "fetchByFilename">;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_PATH = "/core/busytex";
const PACKAGE_RE = /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi;
const CLASS_RE =
  /\\(?:documentclass|LoadClass|LoadClassWithOptions)(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi;
const BIB_STYLE_RE = /\\bibliographystyle\s*\{([^}]+)\}/gi;
const QUOTED_MISSING_FILE_RE =
  /(?:File\s+[`'"]([^`'"\r\n]+)[`'"]\s+not found|I can't find file\s+[`'"]([^`'"\r\n]+)[`'"])/gi;
const MKTEX_FONT_RE = /(?:mktextfm|mktexmf)\s+(?:[^\r\n]*?\s)?([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/gim;
const TEX_FONT_METRIC_RE =
  /Font\s+\\[^=\r\n]+=\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s+at\s+[^\r\n]+)?\s+not loadable:\s+Metric/gi;
const PROVIDES_RE = /\\Provides(Package|Class|File)\s*\{([^}]+)\}/gi;
const RUNTIME_PACKAGE_DEP_RE = /\\(?:RequirePackage|usepackage)(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi;
const RUNTIME_CLASS_DEP_RE =
  /\\(?:LoadClass|LoadClassWithOptions)(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi;
const RUNTIME_INPUT_DEP_RE = /\\(?:input|InputIfFileExists)\s*\{([A-Za-z0-9][A-Za-z0-9._+/-]*)\}/gi;
const MAX_DEPENDENCY_REQUESTS = 128;
const MAX_SCANNED_SOURCE_BYTES = 512 * 1024;

// kpathsea's kpse_file_format_type numeric values. BusyTeX's remote VFS is
// keyed by both format and basename, so registering every archive member as
// format 26 (TeX input) makes downloaded fonts/BibTeX styles invisible to the
// engine that requested them.
const KPSE_FORMAT_BY_EXTENSION: Readonly<Record<string, number>> = {
  gf: 0,
  pk: 1,
  tfm: 3,
  afm: 4,
  base: 5,
  bib: 6,
  bst: 7,
  cnf: 8,
  fmt: 10,
  map: 11,
  mem: 12,
  mf: 13,
  mp: 16,
  ocp: 19,
  ofm: 20,
  opl: 21,
  otp: 22,
  ovf: 23,
  ovp: 24,
  pdf: 25,
  png: 25,
  jpg: 25,
  jpeg: 25,
  eps: 25,
  // TeX Live added texsource, tex_ps_header, and troff_font before
  // Type1. Values copied from the 2026 kpathsea/types.h enum.
  pfa: 32,
  pfb: 32,
  vf: 33,
  ist: 35,
  ttf: 36,
  ttc: 36,
  enc: 44,
  cmap: 45,
  sfd: 46,
  otf: 47,
  otc: 47,
  lua: 51,
  luc: 51,
  fea: 52,
};
const TEX_INPUT_EXTENSIONS = new Set([
  "tex",
  "sty",
  "cls",
  "clo",
  "def",
  "fd",
  "cfg",
  "bbx",
  "cbx",
  "lbx",
  "ltd",
  "ldf",
  "code",
]);
const EXTENSIONLESS_REMOTE_ALIASES = new Set(["tex", "tfm", "ofm", "vf"]);

/**
 * Bridges BusyTeX's static TeX Live bundles with the existing same-origin
 * CTAN relay. Declared packages are loaded before the first engine pass and
 * transitive missing files can be resolved after a failed pass.
 */
export class BusyTexPackageResolver implements BusyTexRuntimeFileResolver {
  private readonly basePath: string;
  private readonly fetcher: Pick<CtanFetcher, "fetchByFilename">;
  private readonly fetchImpl: typeof fetch;
  private bundledFilesPromise: Promise<ReadonlySet<string>> | null = null;
  private readonly resolvedFiles = new Map<string, TexliveRemoteFile>();

  constructor(options: BusyTexPackageResolverOptions = {}) {
    this.basePath = (options.busytexBasePath ?? DEFAULT_BASE_PATH).replace(/\/$/, "");
    this.fetcher = options.fetcher ?? new CtanFetcher();
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async resolveDeclared(
    project: Project,
    edits: Record<string, string> | undefined,
  ): Promise<TexliveRemoteFile[]> {
    // A BusyTexPackageResolver outlives individual runners. A fresh runner has
    // an empty remote-file filesystem even when CTAN archives remain cached.
    this.resolvedFiles.clear();
    const source = effectiveText(project, edits);
    const requested = new Set<string>();
    for (const match of source.matchAll(PACKAGE_RE)) {
      for (const name of match[1]!.split(",")) addRequestedFile(requested, name, ".sty");
    }
    for (const match of source.matchAll(CLASS_RE)) {
      addRequestedFile(requested, match[1]!, ".cls");
    }
    for (const match of source.matchAll(BIB_STYLE_RE)) {
      addRequestedFile(requested, match[1]!, ".bst");
    }

    const localFiles = new Set(
      activeFilePaths(project, edits).map((path) => fileBasename(path).toLowerCase()),
    );
    const bundledFiles = await this.loadBundledFiles();
    const missing = [...requested].filter(
      (filename) =>
        !localFiles.has(filename.toLowerCase()) &&
        !bundledFiles.has(filename.toLowerCase()) &&
        !this.isInstalled(filename),
    );
    return this.fetchFiles(missing);
  }

  async resolveMissing(rawLog: string): Promise<TexliveRemoteFile[]> {
    const requested = extractMissingRuntimeFilenames(rawLog);
    const output = new Map<string, TexliveRemoteFile>();
    const missing: string[] = [];
    for (const name of requested) {
      const cached = this.cachedFilesForRequest(name);
      if (cached.length > 0) {
        for (const file of cached) output.set(remoteFileKey(file.name, file.format), file);
      } else missing.push(name);
    }
    for (const file of await this.fetchFiles(missing)) {
      output.set(remoteFileKey(file.name, file.format), file);
    }
    return [...output.values()];
  }

  private async loadBundledFiles(): Promise<ReadonlySet<string>> {
    if (!this.bundledFilesPromise) {
      const catalogUrls = ["basic", "recommended", "extra"].map(
        (name) => `${this.basePath}/texlive-${name}.js.providespackage.txt`,
      );
      this.bundledFilesPromise = Promise.all(
        catalogUrls.map(async (url) => {
          const response = await this.fetchImpl(url);
          if (!response.ok)
            throw new Error(`BusyTeX package catalog ${url} -> HTTP ${response.status}`);
          return response.text();
        }),
      )
        .then((catalogs) => {
          const files = new Set<string>();
          for (const catalog of catalogs) {
            for (const match of catalog.matchAll(PROVIDES_RE)) {
              const kind = match[1]!.toLowerCase();
              const providedName = match[2]!;
              const extension = kind === "package" ? ".sty" : kind === "class" ? ".cls" : "";
              files.add(
                fileBasename(
                  extension && !providedName.toLowerCase().endsWith(extension)
                    ? `${providedName}${extension}`
                    : providedName,
                ).toLowerCase(),
              );
            }
          }
          return files;
        })
        .catch((error) => {
          this.bundledFilesPromise = null;
          throw error;
        });
    }
    return this.bundledFilesPromise;
  }

  private async fetchFiles(filenames: string[]): Promise<TexliveRemoteFile[]> {
    const output = new Map<string, TexliveRemoteFile>();
    const pending = [...filenames];
    const requested = new Set<string>();
    while (pending.length > 0 && requested.size < MAX_DEPENDENCY_REQUESTS) {
      const filename = pending.shift()!;
      const requestKey = filename.toLowerCase();
      if (requested.has(requestKey)) continue;
      requested.add(requestKey);
      if (
        this.isInstalled(filename) ||
        output.has(remoteFileKey(filename, kpseFormatForFilename(filename)))
      ) {
        continue;
      }
      const files = await this.fetcher.fetchByFilename(filename);
      for (const file of files) {
        for (const remoteFile of toRemoteFiles(file)) {
          const key = remoteFileKey(remoteFile.name, remoteFile.format);
          if (!remoteFile.name || this.resolvedFiles.has(key) || output.has(key)) continue;
          output.set(key, remoteFile);
        }
      }
      for (const dependency of runtimeDependenciesIn(files, filename)) {
        if (!requested.has(dependency.toLowerCase())) pending.push(dependency);
      }
    }
    for (const [key, file] of output) this.resolvedFiles.set(key, file);
    return [...output.values()];
  }

  private isInstalled(filename: string): boolean {
    return this.resolvedFiles.has(remoteFileKey(filename, kpseFormatForFilename(filename)));
  }

  private cachedFilesForRequest(filename: string): TexliveRemoteFile[] {
    const format = kpseFormatForFilename(filename);
    const names = EXTENSIONLESS_REMOTE_ALIASES.has(fileExtension(filename))
      ? [filename, stripExtension(filename)]
      : [filename];
    return names
      .map((name) => this.resolvedFiles.get(remoteFileKey(name, format)))
      .filter((file): file is TexliveRemoteFile => file !== undefined);
  }
}

export function extractMissingRuntimeFilenames(rawLog: string): string[] {
  const requested = new Map<string, string>();
  for (const match of rawLog.matchAll(QUOTED_MISSING_FILE_RE)) {
    addMissingRuntimeFilename(requested, match[1] ?? match[2] ?? "");
  }
  for (const match of rawLog.matchAll(MKTEX_FONT_RE)) {
    const raw = match[1]!;
    addMissingRuntimeFilename(requested, raw.includes(".") ? raw : `${raw}.tfm`);
  }
  for (const match of rawLog.matchAll(TEX_FONT_METRIC_RE)) {
    const raw = match[1]!;
    addMissingRuntimeFilename(requested, raw.includes(".") ? raw : `${raw}.tfm`);
  }
  return [...requested.values()];
}

export function kpseFormatForFilename(filename: string): number {
  const extension = fileExtension(filename);
  if (TEX_INPUT_EXTENSIONS.has(extension)) return 26;
  return KPSE_FORMAT_BY_EXTENSION[extension] ?? 26;
}

function effectiveText(project: Project, edits: Record<string, string> | undefined): string {
  return activeFilePaths(project, edits)
    .map((path) => edits?.[path] ?? project.files[path]?.content)
    .filter((content): content is string => typeof content === "string")
    .join("\n");
}

function addRequestedFile(output: Set<string>, rawName: string, extension: string): void {
  const name = rawName.trim();
  if (!name || name.includes("\\") || name.includes("{") || name.includes("}")) return;
  output.add(fileBasename(name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`));
}

function fileBasename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function toRemoteFiles(file: CtanFile): TexliveRemoteFile[] {
  const name = fileBasename(file.filename);
  const format = kpseFormatForFilename(name);
  const files = [{ name, format, content: file.content }];
  // kpathsea asks the JavaScript remote hook for the literal argument to
  // `\input` before applying TeX's default .tex extension. Registering only
  // `binhex.tex`, for example, therefore cannot satisfy `\input{binhex}`.
  if (EXTENSIONLESS_REMOTE_ALIASES.has(fileExtension(name))) {
    files.push({ name: stripExtension(name), format, content: file.content });
  }
  return files;
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function addMissingRuntimeFilename(output: Map<string, string>, rawName: string): void {
  const name = fileBasename(rawName.trim());
  if (!name || name.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name)) return;
  const extension = fileExtension(name);
  if (
    !extension ||
    (!TEX_INPUT_EXTENSIONS.has(extension) && !(extension in KPSE_FORMAT_BY_EXTENSION))
  ) {
    return;
  }
  output.set(name.toLowerCase(), name);
}

function remoteFileKey(filename: string, format: number | undefined): string {
  return `${format ?? 26}/${filename.toLowerCase()}`;
}

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

function runtimeDependenciesIn(files: readonly CtanFile[], requestedFilename: string): string[] {
  const dependencies = new Set<string>();
  for (const file of files) {
    if (file.filename.toLowerCase() !== requestedFilename.toLowerCase()) continue;
    const extension = fileExtension(file.filename);
    if (
      !TEX_INPUT_EXTENSIONS.has(extension) ||
      file.content.byteLength > MAX_SCANNED_SOURCE_BYTES
    ) {
      continue;
    }
    const source = new TextDecoder("utf-8", { fatal: false }).decode(file.content);
    for (const match of source.matchAll(RUNTIME_PACKAGE_DEP_RE)) {
      for (const name of match[1]!.split(",")) addRequestedFile(dependencies, name, ".sty");
    }
    for (const match of source.matchAll(RUNTIME_CLASS_DEP_RE)) {
      addRequestedFile(dependencies, match[1]!, ".cls");
    }
    for (const match of source.matchAll(RUNTIME_INPUT_DEP_RE)) {
      const rawName = match[1]!.trim();
      const name = fileBasename(rawName);
      if (!name) continue;
      dependencies.add(name.includes(".") ? name : `${name}.tex`);
    }
  }
  return [...dependencies];
}
