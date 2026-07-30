import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import {
  BusyTexPackageResolver,
  extractMissingRuntimeFilenames,
  kpseFormatForFilename,
} from "./busytex-package-resolver";

function project(source: string): Project {
  return {
    id: "resolver",
    name: "Resolver",
    entry: "main.tex",
    files: {
      "main.tex": {
        id: "main",
        path: "main.tex",
        name: "main.tex",
        kind: "tex",
        content: source,
      },
    },
    folders: {},
    createdAt: "2026-07-10T00:00:00Z",
  };
}

function catalogFetch(contents: string[]): typeof fetch {
  let index = 0;
  return vi.fn(
    async () => new Response(contents[index++] ?? "", { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("BusyTexPackageResolver", () => {
  it("fetches only declarations absent from the bundled catalogs and local project", async () => {
    const fetchByFilename = vi.fn(async (filename: string) =>
      filename === "algorithm.sty"
        ? [
            { filename: "algorithm.sty", content: new Uint8Array([1]) },
            { filename: "algorithmic.sty", content: new Uint8Array([2]) },
          ]
        : [],
    );
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch([
        "\\ProvidesClass{article}\n\\ProvidesPackage{amsmath}",
        "\\ProvidesPackage{geometry}",
        "",
      ]),
    });
    const input = project(
      "\\documentclass{article}\n\\usepackage{amsmath,geometry,algorithm,algorithmic,local}",
    );
    input.files["local.sty"] = {
      id: "local",
      path: "local.sty",
      name: "local.sty",
      kind: "sty",
      content: "\\ProvidesPackage{local}",
    };

    const files = await resolver.resolveDeclared(input, undefined);

    expect(fetchByFilename).toHaveBeenCalledTimes(1);
    expect(fetchByFilename).toHaveBeenCalledWith("algorithm.sty");
    expect(files.map((file) => file.name)).toEqual(["algorithm.sty", "algorithmic.sty"]);
  });

  it("extracts transitive missing runtime files from a failed TeX log", async () => {
    const fetchByFilename = vi.fn(async (filename: string) => [
      { filename, content: new Uint8Array([3]) },
    ]);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });

    const files = await resolver.resolveMissing(
      "! LaTeX Error: File `dependency.sty' not found.\nFile 'layout.cls' not found\nFile `data.ltd' not found",
    );

    expect(fetchByFilename).toHaveBeenNthCalledWith(1, "dependency.sty");
    expect(fetchByFilename).toHaveBeenNthCalledWith(2, "layout.cls");
    expect(fetchByFilename).toHaveBeenNthCalledWith(3, "data.ltd");
    expect(files.map((file) => file.name)).toEqual(["dependency.sty", "layout.cls", "data.ltd"]);
  });

  it("rehydrates a previously resolved file when the engine reports it missing again", async () => {
    const content = new Uint8Array([7, 8, 9]);
    const fetchByFilename = vi.fn(async (filename: string) => [{ filename, content }]);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });

    const first = await resolver.resolveMissing("File `binhex.tex' not found");
    const second = await resolver.resolveMissing("File `binhex.tex' not found");

    expect(fetchByFilename).toHaveBeenCalledTimes(1);
    expect(first).toEqual([
      { name: "binhex.tex", format: 26, content },
      { name: "binhex", format: 26, content },
    ]);
    expect(second).toEqual(first);
  });

  it("detects generic TeX, graphics, bibliography, and font misses", () => {
    expect(
      extractMissingRuntimeFilenames(
        [
          "! LaTeX Error: File `tikzlibrarygraphdrawing.code.tex' not found.",
          "I can't find file `language.ldf'",
          "File 'custom.bst' not found",
          "File `diagram.pdf' not found",
          "kpathsea: Running mktextfm FancyMath-Regular",
          "! Font \\broken=LegacyMath10 at 10.0pt not loadable: Metric (TFM) file not found.",
          "File '../../escape.sty' not found",
          "File 'payload.exe' not found",
        ].join("\n"),
      ),
    ).toEqual([
      "tikzlibrarygraphdrawing.code.tex",
      "language.ldf",
      "custom.bst",
      "diagram.pdf",
      "escape.sty",
      "FancyMath-Regular.tfm",
      "LegacyMath10.tfm",
    ]);
  });

  it("registers downloaded assets under their kpathsea file formats", () => {
    expect(kpseFormatForFilename("package.sty")).toBe(26);
    expect(kpseFormatForFilename("references.bib")).toBe(6);
    expect(kpseFormatForFilename("plainnat.bst")).toBe(7);
    expect(kpseFormatForFilename("font.tfm")).toBe(3);
    expect(kpseFormatForFilename("font.otf")).toBe(47);
    expect(kpseFormatForFilename("font.ttf")).toBe(36);
    expect(kpseFormatForFilename("font.pfb")).toBe(32);
    expect(kpseFormatForFilename("encoding.enc")).toBe(44);
    expect(kpseFormatForFilename("image.pdf")).toBe(25);
    expect(kpseFormatForFilename("unknown.extension")).toBe(26);
  });

  it("rehydrates non-TeX runtime files without creating extensionless aliases", async () => {
    const fetchByFilename = vi.fn(async (filename: string) => [
      { filename, content: new Uint8Array([5]) },
    ]);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });

    await resolver.resolveMissing("File `publisher.sty' not found");
    const cached = await resolver.resolveMissing("File `publisher.sty' not found");

    expect(fetchByFilename).toHaveBeenCalledOnce();
    expect(cached.map((file) => file.name)).toEqual(["publisher.sty"]);
  });

  it("registers extensionless aliases for literal TeX inputs and font lookups", async () => {
    const fetchByFilename = vi.fn(async () => [
      { filename: "helper.tex", content: new Uint8Array([1]) },
      { filename: "Font-Regular.tfm", content: new Uint8Array([2]) },
      { filename: "Font-Regular.vf", content: new Uint8Array([3]) },
    ]);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });

    const files = await resolver.resolveMissing("File `helper.tex' not found");

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "helper", format: 26 }),
        expect.objectContaining({ name: "Font-Regular", format: 3 }),
        expect.objectContaining({ name: "Font-Regular", format: 33 }),
      ]),
    );
  });

  it("preloads inherited classes and classic bibliography styles", async () => {
    const fetchByFilename = vi.fn(async (filename: string) => [
      { filename, content: new Uint8Array([1]) },
      { filename: "CustomFont.tfm", content: new Uint8Array([2]) },
      { filename: "CustomFont.pfb", content: new Uint8Array([3]) },
    ]);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });
    const input = project("\\LoadClass{PublisherClass}\n\\bibliographystyle{PublisherStyle}");

    const files = await resolver.resolveDeclared(input, undefined);

    expect(fetchByFilename).toHaveBeenNthCalledWith(1, "PublisherClass.cls");
    expect(fetchByFilename).toHaveBeenNthCalledWith(2, "PublisherStyle.bst");
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "CustomFont.tfm", format: 3 }),
        expect.objectContaining({ name: "CustomFont.pfb", format: 32 }),
      ]),
    );
  });

  it("preloads literal package and input dependencies before the first TeX pass", async () => {
    const encoder = new TextEncoder();
    const fetchByFilename = vi.fn(async (filename: string) => {
      if (filename === "outer.sty") {
        return [
          {
            filename,
            content: encoder.encode(
              "\\RequirePackage{inner}\\input{binhex}\\InputIfFileExists{config.def}{}{}",
            ),
          },
        ];
      }
      return [{ filename, content: encoder.encode("% dependency") }];
    });
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: catalogFetch(["", "", ""]),
    });

    const files = await resolver.resolveDeclared(
      project("\\documentclass{article}\\usepackage{outer}"),
      undefined,
    );

    expect(fetchByFilename).toHaveBeenCalledWith("inner.sty");
    expect(fetchByFilename).toHaveBeenCalledWith("binhex.tex");
    expect(fetchByFilename).toHaveBeenCalledWith("config.def");
    expect(files.map((file) => file.name)).toEqual(
      expect.arrayContaining(["outer.sty", "inner.sty", "binhex.tex", "config.def"]),
    );
  });

  it("surfaces a failed bundle catalog request and retries it on the next compile", async () => {
    let request = 0;
    const fetchImpl = vi.fn(async () => {
      request += 1;
      return request === 1
        ? new Response("offline", { status: 503 })
        : new Response("\\ProvidesFile{plain.def}", { status: 200 });
    });
    const fetchByFilename = vi.fn(async () => []);
    const resolver = new BusyTexPackageResolver({
      fetcher: { fetchByFilename },
      fetchImpl: fetchImpl as typeof fetch,
    });
    const input = project("\\documentclass{article}");

    await expect(resolver.resolveDeclared(input, undefined)).rejects.toThrow(/HTTP 503/);
    await expect(resolver.resolveDeclared(input, undefined)).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(fetchByFilename).toHaveBeenCalledWith("article.cls");
  });

  it("ignores malformed declarations and deduplicates archive files across a cached catalog", async () => {
    const fetchByFilename = vi.fn(async () => [
      { filename: "", content: new Uint8Array([0]) },
      { filename: "valid.sty", content: new Uint8Array([1]) },
      { filename: "VALID.sty", content: new Uint8Array([2]) },
    ]);
    const fetchImpl = catalogFetch(["\\ProvidesPackage{already.sty}", "", ""]);
    const resolver = new BusyTexPackageResolver({ fetcher: { fetchByFilename }, fetchImpl });
    const input = project(
      "\\documentclass{}\n\\usepackage{,valid.sty,\\dynamic}\n\\usepackage{already}",
    );
    input.files["image.png"] = {
      id: "image",
      path: "image.png",
      name: "image.png",
      kind: "img",
      content: new Uint8Array([137]),
    };

    const first = await resolver.resolveDeclared(input, undefined);
    const second = await resolver.resolveDeclared(input, {
      "main.tex": input.files["main.tex"]!.content as string,
    });

    expect(first.map((file) => file.name)).toEqual(["valid.sty"]);
    expect(second.map((file) => file.name)).toEqual(["valid.sty"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchByFilename).toHaveBeenCalledTimes(2);
  });
});
