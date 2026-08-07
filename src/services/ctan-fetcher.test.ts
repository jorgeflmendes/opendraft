import { describe, it, expect, vi } from "vitest";
import { CtanFetcher } from "./ctan-fetcher";

// The fetcher composes index lookup + xz-decompress + tar extraction.
// We test the lookup behaviour and request shape end-to-end, but stub
// the download path through `fetchImpl` so we don't depend on a live
// CTAN mirror or shipping a binary fixture into the repo. The
// decompression code path is exercised by happy-path tests elsewhere
// (xz-decompress is its own well-tested library) - what we own here is
// the lookup / cache / coalescing behaviour.

const indexJson = JSON.stringify({
  "article.cls": ["latex", "latex-base-dev"],
  "amsmath.sty": ["amsmath"],
});

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

describe("CtanFetcher", () => {
  it("returns [] for an unknown filename", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(indexJson));
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    const files = await fetcher.fetchByFilename("unknown.cls");
    expect(files).toEqual([]);
    // Only the index was fetched.
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("loads the index exactly once across concurrent calls", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/idx.json")) return jsonResponse(indexJson);
      return new Response("nope", { status: 404 });
    });
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    await Promise.all([
      fetcher.fetchByFilename("unknown1"),
      fetcher.fetchByFilename("unknown2"),
      fetcher.fetchByFilename("unknown3"),
    ]);
    const idxCalls = fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith("/idx.json"));
    expect(idxCalls).toHaveLength(1);
  });

  it("resolves TeX inputs requested without their implicit .tex suffix", async () => {
    const indexWithRuntimeData = JSON.stringify({
      "lipsum.sty": ["lipsum"],
      "lipsum.ltd.tex": ["lipsum"],
    });
    const fetchImpl = vi.fn(async () => jsonResponse(indexWithRuntimeData));
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    const style = { filename: "lipsum.sty", content: new Uint8Array([1]) };
    const runtimeData = { filename: "lipsum.ltd.tex", content: new Uint8Array([2]) };
    const fetchPackage = vi.spyOn(fetcher, "fetchPackage").mockResolvedValue([runtimeData, style]);

    expect(await fetcher.fetchByFilename("lipsum.ltd")).toEqual([runtimeData, style]);
    expect(fetchPackage).toHaveBeenCalledOnce();
  });

  it("falls through every candidate package until one resolves", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith("/idx.json")) return jsonResponse(indexJson);
      // latex.tar.xz -> 404, latex-base-dev.tar.xz -> 404
      return new Response("nope", { status: 404 });
    });
    const fetcher = new CtanFetcher({
      fetchImpl,
      indexUrl: "/idx.json",
      mirrorBase: "https://m.example",
    });
    const files = await fetcher.fetchByFilename("article.cls");
    expect(files).toEqual([]);
    const archiveCalls = fetchImpl.mock.calls.filter((c) => String(c[0]).includes("/archive/"));
    // Both candidates were tried.
    expect(archiveCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("retries the index after a transient failure", async () => {
    let pass = 0;
    const fetchImpl = vi.fn(async () => {
      pass++;
      if (pass === 1) throw new Error("network blip");
      return jsonResponse(indexJson);
    });
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    await expect(fetcher.fetchByFilename("article.cls")).rejects.toThrow(/blip/);
    // Second attempt rebuilds the index promise.
    const files = await fetcher.fetchByFilename("unknown");
    expect(files).toEqual([]);
    expect(pass).toBeGreaterThanOrEqual(2);
  });

  it("coalesces concurrent fetchPackage calls into one network request", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith("/idx.json")) return jsonResponse(indexJson);
      // Return a body that intentionally fails decompression so we
      // surface the network-coalescing behaviour without depending on
      // a real xz/tar fixture.
      return new Response(new Uint8Array([0]), { status: 200 });
    });
    const fetcher = new CtanFetcher({
      fetchImpl,
      indexUrl: "/idx.json",
      mirrorBase: "https://m.example",
    });
    const a = fetcher.fetchPackage("amsmath").catch(() => "err");
    const b = fetcher.fetchPackage("amsmath").catch(() => "err");
    await Promise.all([a, b]);
    const archiveCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes("/archive/amsmath.tar.xz"),
    );
    expect(archiveCalls).toHaveLength(1);
  });

  it("rejects fetchPackage for an invalid package name without hitting the network", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(indexJson));
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    await expect(fetcher.fetchPackage("../../etc/passwd")).rejects.toThrow(/invalid package name/);
    // No archive request was made.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips index-listed packages whose names fail validation", async () => {
    const poisoned = JSON.stringify({ "article.cls": ["../evil", "http://x/y"] });
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/idx.json")) return jsonResponse(poisoned);
      return new Response("nope", { status: 404 });
    });
    const fetcher = new CtanFetcher({
      fetchImpl,
      indexUrl: "/idx.json",
      mirrorBase: "https://m.example",
    });
    const files = await fetcher.fetchByFilename("article.cls");
    expect(files).toEqual([]);
    // Neither malformed candidate reached the mirror.
    const archiveCalls = fetchImpl.mock.calls.filter((c) => String(c[0]).includes("/archive/"));
    expect(archiveCalls).toHaveLength(0);
  });

  it("ignores prototype-chain keys in the index", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(indexJson));
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });
    // "constructor" / "__proto__" resolve on a plain object's
    // prototype; the fetcher must treat them as unknown.
    expect(await fetcher.fetchByFilename("constructor")).toEqual([]);
    expect(await fetcher.fetchByFilename("__proto__")).toEqual([]);
  });

  it("percent-encodes the package name in the archive URL", async () => {
    // A valid-but-dotted name still round-trips through encodeURIComponent.
    const idx = JSON.stringify({ "x.sty": ["latex.ltx-pkg"] });
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/idx.json")) return jsonResponse(idx);
      return new Response("nope", { status: 404 });
    });
    const fetcher = new CtanFetcher({
      fetchImpl,
      indexUrl: "/idx.json",
      mirrorBase: "https://m.example",
    });
    await fetcher.fetchByFilename("x.sty");
    const archiveCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes("/archive/"));
    expect(archiveCall?.[0]).toBe("https://m.example/archive/latex.ltx-pkg.tar.xz");
  });

  it("loads the format-compatible l3kernel from pinned same-origin assets", async () => {
    // The rolling index may list its development variant first; the format
    // lock still takes precedence.
    const idx = JSON.stringify({ "expl3.sty": ["l3kernel-dev", "l3kernel"] });
    const manifest = JSON.stringify({
      package: "l3kernel",
      version: "2026-06-18",
      sourceSha256: "abc",
      files: [
        { filename: "expl3-code.tex", path: "tex/latex/l3kernel/expl3-code.tex", size: 2 },
        { filename: "expl3.sty", path: "tex/latex/l3kernel/expl3.sty", size: 1 },
      ],
    });
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/idx.json")) return jsonResponse(idx);
      if (value.endsWith("/engine/packages/l3kernel.json")) return jsonResponse(manifest);
      if (value.endsWith("/expl3-code.tex")) return new Response(new Uint8Array([1, 2]));
      if (value.endsWith("/expl3.sty")) return new Response(new Uint8Array([3]));
      return new Response("nope", { status: 404 });
    });
    const fetcher = new CtanFetcher({ fetchImpl, indexUrl: "/idx.json" });

    const files = await fetcher.fetchByFilename("expl3.sty");

    expect(files.map((file) => file.filename)).toEqual(["expl3-code.tex", "expl3.sty"]);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("/archive/"))).toBe(false);
  });

  it("does not fall through to rolling CTAN when a pinned kernel asset is unavailable", async () => {
    const idx = JSON.stringify({ "expl3.sty": ["l3kernel", "l3kernel-dev"] });
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/idx.json")) return jsonResponse(idx);
      return new Response("missing", { status: 404 });
    });
    const fetcher = new CtanFetcher({
      fetchImpl,
      indexUrl: "/idx.json",
      mirrorBase: "https://m.example",
    });

    await expect(fetcher.fetchByFilename("expl3.sty")).rejects.toThrow(/l3kernel\.json.*404/);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("l3kernel-dev"))).toBe(
      false,
    );
  });
});
