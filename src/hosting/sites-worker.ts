const CTAN_BASE_URL = "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/";
const SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export interface SitesEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

function ctanPath(pathname: string): string | null {
  let decodedPath = pathname.slice("/ctan/".length);
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) break;
      decodedPath = next;
    }
  } catch {
    return null;
  }
  const segments = decodedPath.split("/");
  if (
    decodedPath.includes("\\") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments.map(encodeURIComponent).join("/");
}

function withSecurityHeaders(response: Response, pathname: string, acceptsHtml: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", SECURITY_POLICY);
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");

  if (pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (pathname === "/favicon.svg" || pathname === "/og.png") {
    headers.set("Cache-Control", "public, max-age=86400");
  } else if (acceptsHtml) {
    headers.set("Cache-Control", "no-cache");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyCtan(request: Request, requestUrl: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }
  const relativePath = ctanPath(requestUrl.pathname);
  if (!relativePath) return new Response("Invalid CTAN path", { status: 400 });

  const upstream = await fetch(CTAN_BASE_URL + relativePath + requestUrl.search, {
    method: request.method,
    headers: { Accept: request.headers.get("accept") || "*/*" },
  });
  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function handleSitesRequest(
  request: Request,
  env: SitesEnvironment,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const { pathname } = requestUrl;
  if (pathname.startsWith("/ctan/")) return proxyCtan(request, requestUrl);

  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  let response = await env.ASSETS.fetch(request);
  if (request.method === "GET" && acceptsHtml && response.status === 404) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  }
  if (request.method !== "GET" || !response.ok) return response;
  return withSecurityHeaders(response, pathname, acceptsHtml);
}

export default { fetch: handleSitesRequest };
