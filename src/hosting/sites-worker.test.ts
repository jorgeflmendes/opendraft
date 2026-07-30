import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesRequest, type SitesEnvironment } from "./sites-worker";

afterEach(() => vi.unstubAllGlobals());

function assets(fetch: SitesEnvironment["ASSETS"]["fetch"]): SitesEnvironment {
  return { ASSETS: { fetch } };
}

describe("Sites worker", () => {
  it("proxies an encoded CTAN path to the fixed mirror with bounded headers", async () => {
    const upstream = vi.fn<typeof fetch>(
      async () =>
        new Response("archive", {
          status: 200,
          headers: { "Content-Type": "application/x-xz" },
        }),
    );
    vi.stubGlobal("fetch", upstream);

    const response = await handleSitesRequest(
      new Request("https://opendraft.test/ctan/archive/latex%2Eltx-pkg.tar.xz?download=1", {
        headers: { Accept: "application/x-xz" },
      }),
      assets(vi.fn()),
    );

    expect(upstream).toHaveBeenCalledOnce();
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe(
      "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/archive/latex.ltx-pkg.tar.xz?download=1",
    );
    expect(init).toEqual({
      method: "GET",
      headers: { Accept: "application/x-xz" },
    });
    expect(await response.text()).toBe("archive");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects unsupported methods and encoded traversal before contacting CTAN", async () => {
    const upstream = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", upstream);
    const env = assets(vi.fn());

    const methodResponse = await handleSitesRequest(
      new Request("https://opendraft.test/ctan/archive/pkg.tar.xz", { method: "POST" }),
      env,
    );
    const traversalResponse = await handleSitesRequest(
      new Request("https://opendraft.test/ctan/archive/%252e%252e/pkg.tar.xz"),
      env,
    );

    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("GET, HEAD");
    expect(traversalResponse.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves the SPA fallback and applies document security headers", async () => {
    const assetFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname;
      return pathname === "/index.html"
        ? new Response("<!doctype html>", {
            headers: { "Content-Type": "text/html" },
          })
        : new Response("missing", { status: 404 });
    });

    const response = await handleSitesRequest(
      new Request("https://opendraft.test/editor/project", {
        headers: { Accept: "text/html" },
      }),
      assets(assetFetch),
    );

    expect(assetFetch).toHaveBeenCalledTimes(2);
    expect(new URL(assetFetch.mock.calls[1]![0].url).pathname).toBe("/index.html");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html>");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("marks hashed assets immutable without rewriting failed asset responses", async () => {
    const ok = await handleSitesRequest(
      new Request("https://opendraft.test/assets/app-abc123.js"),
      assets(async () => new Response("script")),
    );
    const missing = await handleSitesRequest(
      new Request("https://opendraft.test/assets/missing.js"),
      assets(async () => new Response("missing", { status: 404 })),
    );

    expect(ok.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Security-Policy")).toBeNull();
  });
});
