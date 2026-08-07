const CTAN_ARCHIVE_BASE = "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/archive/";
const PAGES_ORIGIN = "https://jorgeflmendes.github.io";
const PACKAGE_ARCHIVE_PATH = /^\/archive\/([A-Za-z0-9][A-Za-z0-9._-]*)\.tar\.xz$/;

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": PAGES_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD",
  });
}

function responseWithCors(response: Response): Response {
  const headers = new Headers(response.headers);
  corsHeaders().forEach((value, name) => headers.set(name, value));
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(status: number, message: string): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(message, { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const headers = corsHeaders();
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = errorResponse(405, "Method not allowed");
      response.headers.set("Allow", "GET, HEAD, OPTIONS");
      return response;
    }
    if (url.search) return errorResponse(400, "Query strings are not allowed");

    const match = PACKAGE_ARCHIVE_PATH.exec(url.pathname);
    if (!match?.[1]) return errorResponse(404, "Not found");

    const packageName = match[1];
    const upstream = await fetch(`${CTAN_ARCHIVE_BASE}${encodeURIComponent(packageName)}.tar.xz`, {
      method: request.method,
      headers: { Accept: "application/x-xz, application/octet-stream;q=0.9, */*;q=0.1" },
    });
    return responseWithCors(upstream);
  },
};
