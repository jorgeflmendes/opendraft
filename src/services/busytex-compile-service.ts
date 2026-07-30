import type {
  CompileOptions as BusyTexCompileOptions,
  CompileResult as BusyTexRawResult,
  TexliveRemoteFile,
} from "texlyre-busytex";
import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from "texlyre-busytex";
import { activeFilePaths, type CompileResult, type Project } from "@/domain";
import type { CompileInput, CompileProgress, CompileService } from "./compile-service";
import { analyseServerlessCompatibility, BUSYTEX_CAPABILITIES } from "./latex-compatibility";
import { getFileExtension, dirname } from "./path-utils";
import { parseEngineLog } from "./swiftlatex-compile-service";
import {
  BusyTexPackageResolver,
  type BusyTexRuntimeFileResolver,
} from "./busytex-package-resolver";

type BusyTexEngine = "pdflatex" | "xelatex" | "lualatex";

type BusyTexTool = Pick<PdfLatex | XeLatex | LuaLatex, "compile">;
type BusyTexRunnerLike = Pick<BusyTexRunner, "initialize" | "isInitialized" | "terminate"> & {
  writeTexliveRemoteFiles?: (files: TexliveRemoteFile[]) => Promise<void>;
};

interface BusyTexCompileServiceOptions {
  busytexBasePath?: string;
  remoteEndpoint?: string;
  useWorker?: boolean;
  verbose?: boolean;
  /**
   * Whether to terminate the runner after each compile.
   * Defaults to true to isolate filesystem and package state between projects;
   * disabling it trades that isolation for faster warm compiles.
   */
  freshRunnerPerCompile?: boolean;
  runtimeFileResolver?: BusyTexRuntimeFileResolver;
  createRunner?: () => BusyTexRunnerLike;
  createTool?: (runner: BusyTexRunnerLike, engine: BusyTexEngine) => BusyTexTool;
}

const DEFAULT_BASE_PATH = "/core/busytex";
const DEFAULT_REMOTE_ENDPOINT = "";

const SETUP_STEPS = ["Loading TeX Live 2026 WASM", "Preparing project files"] as const;
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
const MAX_RUNTIME_FILE_RETRIES = 3;

export class BusyTexCompileService implements CompileService {
  private runner: BusyTexRunnerLike | null = null;
  /** Serialises overlapping compile() calls. texlyre-busytex 1.x
   *  shares a single Worker.onmessage handler - two concurrent
   *  compiles would clobber each other's response routing. */
  private inflight: Promise<unknown> = Promise.resolve();
  private readonly busytexBasePath: string;
  private readonly remoteEndpoint: string;
  private readonly useWorker: boolean;
  private readonly verbose: boolean;
  private readonly freshRunnerPerCompile: boolean;
  private readonly runtimeFileResolver: BusyTexRuntimeFileResolver;
  private readonly runnerFactory: () => BusyTexRunnerLike;
  private readonly toolFactory: (runner: BusyTexRunnerLike, engine: BusyTexEngine) => BusyTexTool;

  constructor(options: BusyTexCompileServiceOptions = {}) {
    this.busytexBasePath = options.busytexBasePath ?? DEFAULT_BASE_PATH;
    this.remoteEndpoint = options.remoteEndpoint ?? DEFAULT_REMOTE_ENDPOINT;
    this.useWorker = options.useWorker ?? true;
    this.verbose = options.verbose ?? false;
    this.freshRunnerPerCompile = options.freshRunnerPerCompile ?? true;
    this.runtimeFileResolver =
      options.runtimeFileResolver ??
      new BusyTexPackageResolver({
        busytexBasePath: this.busytexBasePath,
      });
    this.runnerFactory =
      options.createRunner ??
      (() => {
        const dataPackages = Object.values(busyTexDataPackageUrls(this.busytexBasePath));
        return new BusyTexRunner({
          busytexBasePath: this.busytexBasePath,
          verbose: this.verbose,
          engineMode: "combined",
          preloadDataPackages: dataPackages,
          catalogDataPackages: dataPackages,
        });
      });
    this.toolFactory = options.createTool ?? createBusyTexTool;
  }

  async compile(
    input: CompileInput,
    options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    // texlyre-busytex 1.x replaces a shared message handler per invocation.
    const previous = this.inflight;
    let resolveCurrent: () => void = () => {};
    this.inflight = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });
    try {
      await previous;
    } catch {
      // Queue continuity is independent from the previous result.
    }
    try {
      return await this.runCompileLocked(input, options);
    } finally {
      resolveCurrent();
    }
  }

  private async runCompileLocked(
    { project, edits }: CompileInput,
    options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal },
  ): Promise<CompileResult> {
    const start = Date.now();
    const engine = detectBusyTexEngine(project, edits);
    const total = SETUP_STEPS.length + 2;
    const fire = (label: string, index: number) => options.onProgress?.({ label, index, total });

    const compatibilityIssues = analyseServerlessCompatibility(
      project,
      edits,
      BUSYTEX_CAPABILITIES,
    );
    if (compatibilityIssues.length > 0) {
      return {
        status: "error",
        durationMs: Date.now() - start,
        durationLabel: formatDuration(Date.now() - start),
        engine: busyTexEngineLabel(engine),
        log: [
          ...compatibilityIssues,
          {
            level: "info",
            message: "Compile stopped before engine boot to keep execution fully serverless.",
          },
        ],
      };
    }

    if (options.signal?.aborted) return abortedResult(busyTexEngineLabel(engine), start);

    fire(SETUP_STEPS[0]!, 0);
    try {
      if (!this.runner) this.runner = this.runnerFactory();
      if (!this.runner.isInitialized()) await this.runner.initialize(this.useWorker);
    } catch (e) {
      // Init failure leaves the runner in an unknown state - drop
      // it so the next compile builds a fresh one rather than
      // re-using a half-initialised pipeline.
      this.disposeRunner();
      return engineErrorResult(busyTexEngineLabel(engine), start, e);
    }

    if (options.signal?.aborted) return this.abortAndReset(engine, start);

    fire(SETUP_STEPS[1]!, 1);
    await this.preloadRuntimeFiles(project, edits);
    if (options.signal?.aborted) return this.abortAndReset(engine, start);

    const compileOptions = await buildBusyTexOptions(project, edits, engine, this.remoteEndpoint);
    const tool = this.toolFactory(this.runner, engine);

    fire(`Running ${busyTexEngineName(engine)} with TeX Live tooling`, 2);
    let response: BusyTexRawResult;
    try {
      response = await this.compileWithRuntimeFileRetries(tool, compileOptions, options.signal);
    } catch (e) {
      if (options.signal?.aborted) return this.abortAndReset(engine, start);
      // Mid-compile failure is exactly the class of state-leak
      // we can't reason about (worker FS residue, kpathsea cache,
      // partially-loaded data packages). Rebuild from scratch on
      // the next call.
      this.disposeRunner();
      return engineErrorResult(busyTexEngineLabel(engine), start, e);
    }
    if (options.signal?.aborted) return this.abortAndReset(engine, start);

    fire("Reading PDF output", 3);
    const result = toCompileResult(response, engine, start, project.entry);

    // Errors always invalidate potentially partial worker state.
    if (this.freshRunnerPerCompile || result.status === "error") {
      this.disposeRunner();
    }
    return result;
  }

  private abortAndReset(engine: BusyTexEngine, start: number): CompileResult {
    this.disposeRunner();
    return abortedResult(busyTexEngineLabel(engine), start);
  }

  private async preloadRuntimeFiles(
    project: Project,
    edits: Record<string, string> | undefined,
  ): Promise<void> {
    if (!this.runner?.writeTexliveRemoteFiles) return;
    try {
      const files = await this.runtimeFileResolver.resolveDeclared(project, edits);
      if (files.length > 0) await this.runner.writeTexliveRemoteFiles(files);
    } catch {
      // A catalog or CTAN outage must not prevent documents that only use
      // already-bundled packages from compiling. Missing files are detected
      // from the real engine log and retried below when possible.
    }
  }

  private async compileWithRuntimeFileRetries(
    tool: BusyTexTool,
    compileOptions: BusyTexCompileOptions,
    signal: AbortSignal | undefined,
  ): Promise<BusyTexRawResult> {
    let response = await runWithAbort(tool.compile(compileOptions), signal, () =>
      this.runner?.terminate(),
    );
    for (let attempt = 0; attempt < MAX_RUNTIME_FILE_RETRIES && !response.success; attempt++) {
      if (signal?.aborted || !this.runner?.writeTexliveRemoteFiles) break;
      let files: TexliveRemoteFile[];
      try {
        files = await this.runtimeFileResolver.resolveMissing(combinedBusyTexLog(response));
      } catch {
        break;
      }
      if (files.length === 0) break;
      await this.runner.writeTexliveRemoteFiles(files);
      response = await runWithAbort(tool.compile(compileOptions), signal, () =>
        this.runner?.terminate(),
      );
    }
    return response;
  }

  private disposeRunner(): void {
    try {
      this.runner?.terminate();
    } catch {
      // terminate() throws when the worker is already gone - fine,
      // we're tearing down regardless.
    }
    this.runner = null;
  }
}

export function detectBusyTexEngine(
  project: Project,
  edits: Record<string, string> | undefined,
): BusyTexEngine {
  const files = effectiveTextFiles(project, edits);
  const joined = files.map((file) => file.content).join("\n");
  const entryContent = files.find((file) => file.path === project.entry)?.content ?? "";
  // TeX program magic belongs to the root document. Honouring a directive
  // found in an included chapter or vendored style file makes engine choice
  // depend on object insertion order and can silently compile with the wrong
  // runtime.
  const magic = /^%\s*!TEX\s+(?:TS-)?program\s*=\s*([^\s]+)\b/im
    .exec(entryContent)?.[1]
    ?.toLowerCase();
  if (magic === "lualatex" || magic === "luatex" || magic === "luahbtex") return "lualatex";
  if (magic === "xelatex" || magic === "xetex") return "xelatex";
  if (magic === "pdflatex" || magic === "pdftex") return "pdflatex";
  const packageNames = new Set(packagesIn(joined).map((pkg) => pkg.name));
  if (
    ["luacode", "luaotfload", "luatexbase", "luatexja", "luatex85"].some((pkg) =>
      packageNames.has(pkg),
    )
  ) {
    return "lualatex";
  }
  // Default to xelatex to ensure correct Type1C font embedding
  // and ToUnicode maps when rendering in PDF.js.
  return "xelatex";
}

export async function buildBusyTexOptions(
  project: Project,
  edits: Record<string, string> | undefined,
  engine: BusyTexEngine,
  remoteEndpoint: string = DEFAULT_REMOTE_ENDPOINT,
): Promise<BusyTexCompileOptions> {
  const files = addExtensionlessInputAliases(effectiveFiles(project, edits));
  const entry = files.find((file) => file.path === project.entry);
  const input = normalizeClassicBibliographyStyle(
    typeof entry?.content === "string" ? entry.content : "",
  );
  const additionalFiles = await Promise.all(
    files
      .filter((file) => file.path !== project.entry)
      .map(async (file) => {
        let content = file.content;
        if (typeof Blob !== "undefined" && content instanceof Blob) {
          content = new Uint8Array(await content.arrayBuffer());
        }
        return { path: file.path, content: content as string | Uint8Array };
      }),
  );

  const sourceText = files
    .filter((file) => textLikePath(file.path))
    .map((file) => file.content)
    .join("\n");

  return {
    input,
    mainTexPath: project.entry,
    additionalFiles,
    bibtex: needsBibtex(sourceText),
    makeindex: needsMakeIndex(sourceText),
    rerun: true,
    verbose: "silent",
    remoteEndpoint,
    driver: driverFor(engine),
  };
}

export function busyTexDataPackageUrls(basePath: string): {
  basic: string;
  recommended: string;
  extra: string;
} {
  const base = basePath.replace(/\/$/, "");
  return {
    basic: `${base}/texlive-basic.js`,
    recommended: `${base}/texlive-recommended.js`,
    extra: `${base}/texlive-extra.js`,
  };
}

function createBusyTexTool(runner: BusyTexRunnerLike, engine: BusyTexEngine): BusyTexTool {
  const realRunner = runner as BusyTexRunner;
  if (engine === "xelatex") return new XeLatex(realRunner);
  if (engine === "lualatex") return new LuaLatex(realRunner);
  return new PdfLatex(realRunner);
}

function toCompileResult(
  response: BusyTexRawResult,
  engine: BusyTexEngine,
  start: number,
  entryPath: string,
): CompileResult {
  const durationMs = Date.now() - start;
  const durationLabel = formatDuration(durationMs);
  const rawLog = combinedBusyTexLog(response);
  const parsed = parseEngineLog(rawLog, entryPath);

  if (!response.success || !response.pdf) {
    const fallback =
      parsed.length > 0
        ? parsed
        : [
            {
              level: "error" as const,
              message: rawLog ? tailOfLog(rawLog) : `BusyTeX exited with code ${response.exitCode}`,
              filePath: entryPath,
            },
          ];
    return {
      status: "error",
      durationMs,
      durationLabel,
      engine: busyTexEngineLabel(engine),
      log: fallback,
    };
  }

  const status = parsed.some((entry) => entry.level === "warn") ? "warning" : "success";
  const result: CompileResult = {
    status,
    durationMs,
    durationLabel,
    engine: busyTexEngineLabel(engine),
    log: [
      ...parsed,
      {
        level: "info",
        message: `Local compile finished in ${durationLabel} with ${busyTexEngineName(engine)} + BusyTeX.`,
      },
    ],
    pdf: response.pdf,
  };
  // pass synctex through when BusyTeX produced it. The
  // engine emits `.synctex.gz` whenever we request -synctex=1 in
  // the driver invocation (always true in the BusyTeX pipeline).
  if (response.synctex) result.synctex = response.synctex;
  return result;
}

function combinedBusyTexLog(response: BusyTexRawResult): string {
  const detailLogs = response.logs.flatMap((entry) => [
    entry.log,
    entry.stdout,
    entry.stderr,
    entry.texmflog,
    entry.missfontlog,
  ]);
  return [response.log, ...detailLogs].filter(Boolean).join("\n");
}

function effectiveFiles(
  project: Project,
  edits: Record<string, string> | undefined,
): Array<{ path: string; content: string | Uint8Array | Blob }> {
  const paths = new Set(activeFilePaths(project, edits));
  return [...paths].map((path) => ({
    path,
    content: edits?.[path] ?? project.files[path]?.content ?? "",
  }));
}

function effectiveTextFiles(
  project: Project,
  edits: Record<string, string> | undefined,
): Array<{ path: string; content: string }> {
  return effectiveFiles(project, edits)
    .filter((file) => typeof file.content === "string" && textLikePath(file.path))
    .map((file) => ({ path: file.path, content: String(file.content) }));
}

function addExtensionlessInputAliases(
  files: Array<{ path: string; content: string | Uint8Array | Blob }>,
): Array<{ path: string; content: string | Uint8Array | Blob }> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    if (typeof file.content !== "string" || !textLikePath(file.path)) continue;
    const dir = dirname(file.path);
    for (const raw of extensionlessInputs(file.content)) {
      const inputPath = normalizeRelativePath(dir, raw);
      if (!inputPath || inputPath.includes(".")) continue;
      const texPath = `${inputPath}.tex`;
      const styPath = `${inputPath}.sty`;
      if (!byPath.has(texPath) && byPath.has(styPath)) {
        byPath.set(texPath, { path: texPath, content: byPath.get(styPath)!.content });
      }
    }
  }
  return [...byPath.values()];
}

function extensionlessInputs(content: string): string[] {
  return [...content.matchAll(/\\input\s*\{([^}]+)\}/g)].map((match) => match[1]!.trim());
}

function normalizeRelativePath(fromDir: string, raw: string): string {
  const parts = [...(fromDir ? fromDir.split("/") : []), ...raw.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === ".." && out.length > 0) out.pop();
    else if (part !== "..") out.push(part);
  }
  return out.join("/");
}

function textLikePath(path: string): boolean {
  const ext = getFileExtension(path);
  return TEXT_LIKE_EXTENSIONS.has(ext);
}

function needsBibtex(source: string): boolean {
  if (usesBiblatex(source)) {
    return biblatexUsesBibtexBackend(source);
  }
  return /\\bibliography\s*\{/i.test(source);
}

function normalizeClassicBibliographyStyle(input: string): string {
  if (!/\\bibliography\s*\{/i.test(input)) return input;
  if (/\\bibliographystyle\s*\{/i.test(input)) return input;
  if (/\\usepackage(?:\[[^\]]*])?\{[^}]*\bbiblatex\b/i.test(input)) return input;
  return input.replace(/\\bibliography\s*\{/, "\\bibliographystyle{plain}\n\\bibliography{");
}

function needsMakeIndex(source: string): boolean {
  return /\\(?:makeindex|printindex)\b/i.test(source);
}

function usesBiblatex(source: string): boolean {
  return packagesIn(source).some((pkg) => pkg.name === "biblatex");
}

function biblatexUsesBibtexBackend(source: string): boolean {
  return packagesIn(source).some(
    (pkg) => pkg.name === "biblatex" && /\bbackend\s*=\s*bibtex8?\b/i.test(pkg.options),
  );
}

function packagesIn(source: string): Array<{ name: string; options: string }> {
  const packages: Array<{ name: string; options: string }> = [];
  for (const match of source.matchAll(PACKAGE_RE)) {
    const options = match[1] ?? "";
    const names = match[2]!.split(",").map((name) => name.trim().toLowerCase());
    for (const name of names) {
      if (name) packages.push({ name, options });
    }
  }
  return packages;
}

function driverFor(
  engine: BusyTexEngine,
): "xetex_bibtex8_dvipdfmx" | "pdftex_bibtex8" | "luahbtex_bibtex8" {
  if (engine === "xelatex") return "xetex_bibtex8_dvipdfmx";
  if (engine === "lualatex") return "luahbtex_bibtex8";
  return "pdftex_bibtex8";
}

function busyTexEngineName(engine: BusyTexEngine): string {
  if (engine === "xelatex") return "XeLaTeX";
  if (engine === "lualatex") return "LuaLaTeX";
  return "pdfLaTeX";
}

function busyTexEngineLabel(engine: BusyTexEngine): string {
  return `${busyTexEngineName(engine)} · BusyTeX WASM (TeX Live 2026)`;
}

async function runWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort();
    throw new DOMException("Compile cancelled", "AbortError");
  }
  let settled = false;
  let abortHandler: (() => void) | null = null;
  const abortPromise = new Promise<T>((_, reject) => {
    abortHandler = () => {
      if (settled) return;
      onAbort();
      reject(new DOMException("Compile cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    settled = true;
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    // Suppress unhandled rejection on the original promise if we aborted
    promise.catch(() => {});
  }
}

function abortedResult(engine: string, start: number): CompileResult {
  const durationMs = Date.now() - start;
  return {
    status: "idle",
    durationMs,
    durationLabel: formatDuration(durationMs),
    engine,
    log: [{ level: "info", message: "Compile cancelled" }],
  };
}

function engineErrorResult(engine: string, start: number, e: unknown): CompileResult {
  const durationMs = Date.now() - start;
  return {
    status: "error",
    durationMs,
    durationLabel: formatDuration(durationMs),
    engine,
    log: [
      {
        level: "error",
        message:
          e instanceof Error
            ? `Engine failed to load: ${e.message}`
            : `Engine failed to load: ${String(e)}`,
      },
    ],
  };
}

function tailOfLog(raw: string): string {
  const trimmed = raw.trimEnd();
  if (trimmed.length <= 1200) return trimmed;
  return "...\n" + trimmed.slice(-1200);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
