import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./ctan-worker";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CTAN proxy worker", () => {
  it("streams a requested package archive with CORS limited to GitHub Pages", async () => {
    const upstream = vi.fn(async () => new Response("archive", { status: 200 }));
    vi.stubGlobal("fetch", upstream);

    const response = await worker.fetch(
      new Request("https://opendraft-ctan.example.workers.dev/archive/l3kernel.tar.xz"),
    );

    expect(upstream).toHaveBeenCalledWith(
      "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/archive/l3kernel.tar.xz",
      expect.objectContaining({ method: "GET" }),
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://jorgeflmendes.github.io",
    );
    expect(await response.text()).toBe("archive");
  });

  it("does not act as an unrestricted proxy", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await worker.fetch(
      new Request("https://opendraft-ctan.example.workers.dev/archive/../texlive.tlpdb"),
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
