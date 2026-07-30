export type AuxiliaryToolKind =
  | "bibtex"
  | "biber"
  | "makeindex"
  | "makeglossaries"
  | "shell-escape"
  | "xetex"
  | "luatex"
  | "pythontex"
  | "svg-converter";

export interface AuxiliaryToolInput {
  jobName: string;
  files: ReadonlyMap<string, Uint8Array | string>;
}

export interface AuxiliaryToolResult {
  ok: boolean;
  log: string;
  generatedFiles?: ReadonlyMap<string, Uint8Array | string>;
}

export interface AuxiliaryTool {
  kind: AuxiliaryToolKind;
  label: string;
  serverless: boolean;
  available: boolean;
  run(input: AuxiliaryToolInput): Promise<AuxiliaryToolResult>;
}

export class UnavailableAuxiliaryTool implements AuxiliaryTool {
  readonly serverless = true;
  readonly available = false;

  constructor(
    readonly kind: AuxiliaryToolKind,
    readonly label: string,
    private readonly reason: string,
  ) {}

  async run(_input: AuxiliaryToolInput): Promise<AuxiliaryToolResult> {
    return {
      ok: false,
      log: `${this.label} is not bundled as a browser/WASM tool yet. ${this.reason}`,
    };
  }
}

export const DEFAULT_AUXILIARY_TOOLS: readonly AuxiliaryTool[] = [
  new UnavailableAuxiliaryTool(
    "bibtex",
    "BibTeX",
    "Install the BusyTeX assets to enable real browser/WASM BibTeX; SwiftLaTeX keeps a limited .bib-to-.bbl fallback only for legacy installs.",
  ),
  new UnavailableAuxiliaryTool(
    "biber",
    "Biber",
    "Biber is a large external program; it must be ported or replaced before biblatex can run serverlessly.",
  ),
  new UnavailableAuxiliaryTool(
    "makeindex",
    "MakeIndex",
    "Install the BusyTeX assets to enable real browser/WASM MakeIndex.",
  ),
  new UnavailableAuxiliaryTool(
    "makeglossaries",
    "MakeGlossaries",
    "Glossary generation depends on external indexing tools that are not bundled.",
  ),
  new UnavailableAuxiliaryTool(
    "shell-escape",
    "Shell escape",
    "Serverless browser compilation cannot execute operating-system commands.",
  ),
  new UnavailableAuxiliaryTool(
    "xetex",
    "XeTeX",
    "Install the BusyTeX assets to enable browser/WASM XeTeX.",
  ),
  new UnavailableAuxiliaryTool(
    "luatex",
    "LuaTeX",
    "Install the BusyTeX assets to enable browser/WASM LuaTeX.",
  ),
  new UnavailableAuxiliaryTool(
    "pythontex",
    "PythonTeX",
    "Python execution would require a browser runtime such as Pyodide plus package sandboxing.",
  ),
  new UnavailableAuxiliaryTool(
    "svg-converter",
    "SVG converter",
    "SVG inclusion requires a browser-side converter; no server conversion is allowed.",
  ),
];

export function findAuxiliaryTool(
  kind: AuxiliaryToolKind,
  tools: readonly AuxiliaryTool[] = DEFAULT_AUXILIARY_TOOLS,
): AuxiliaryTool | null {
  return tools.find((tool) => tool.kind === kind) ?? null;
}
