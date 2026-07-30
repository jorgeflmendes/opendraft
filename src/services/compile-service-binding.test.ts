import { afterEach, describe, expect, it, vi } from "vitest";
import { BusyTexCompileService } from "./busytex-compile-service";
import { FallbackCompileService } from "./fallback-compile-service";
import { getCompileService, setCompileService } from "./index";
import { SwiftLaTeXCompileService } from "./swiftlatex-compile-service";
import { UnavailableCompileService } from "./unavailable-compile-service";

const headResponse = (ok: boolean, contentType = "text/javascript") =>
  ({
    ok,
    headers: new Headers({ "content-type": contentType }),
  }) as Response;

describe("compile service binding", () => {
  afterEach(() => {
    setCompileService(null);
    vi.unstubAllGlobals();
  });

  it("prefers BusyTeX when the TeX Live 2026 WASM worker is installed", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      headResponse(String(url).includes("/core/busytex/")),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const service = await getCompileService();

    expect(service).toBeInstanceOf(BusyTexCompileService);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to SwiftLaTeX when BusyTeX assets are absent", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      headResponse(String(url).includes("/engine/swiftlatexpdftex.worker.js")),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const service = await getCompileService();

    expect(service).toBeInstanceOf(SwiftLaTeXCompileService);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns an honest unavailable service when no WASM engine is installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => headResponse(false)),
    );

    const service = await getCompileService();

    expect(service).toBeInstanceOf(UnavailableCompileService);
  });

  it("rejects an SPA HTML fallback even when it returns HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => headResponse(true, "text/html; charset=utf-8")),
    );

    expect(await getCompileService()).toBeInstanceOf(UnavailableCompileService);
  });

  it("builds a fallback chain when both engines are installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => headResponse(true)),
    );

    const service = await getCompileService();

    expect(service).toBeInstanceOf(FallbackCompileService);
  });

  it("still probes SwiftLaTeX when the BusyTeX probe rejects", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/core/busytex/")) throw new Error("connection reset");
      return headResponse(true);
    });
    vi.stubGlobal("fetch", fetchImpl);

    const service = await getCompileService();

    expect(service).toBeInstanceOf(SwiftLaTeXCompileService);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache unavailable after a transient missing-asset response", async () => {
    let available = false;
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      headResponse(available && String(url).includes("/core/busytex/")),
    );
    vi.stubGlobal("fetch", fetchImpl);

    expect(await getCompileService()).toBeInstanceOf(UnavailableCompileService);
    available = true;
    expect(await getCompileService()).toBeInstanceOf(BusyTexCompileService);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
