# Deploying OpenDraft

OpenDraft is a static SPA. The build (`npm run build`) produces the client in
`dist/client/` and a Sites worker in `dist/server/`. A conventional static host
can serve `dist/client/` -
**with one wrinkle**: the CTAN package proxy.

## What the host has to do

1. Serve `dist/` as static files with SPA fallback to `index.html`.
2. **Reverse-proxy `/ctan/*` to a TeX Live mirror** so the
   SwiftLaTeX-fallback engine can fetch packages on demand. CTAN
   mirrors don't send CORS headers, so a direct browser fetch fails
   - the proxy is the only way to keep the browser same-origin
     while still pulling from a live archive.
3. Decide whether to ship the engine assets.
   - **BusyTeX** is the local-development engine. Its full TeX Live payload
     lives in `public/core/` and is intentionally not copied into production.
   - **SwiftLaTeX** is the production engine. Its compact runtime lives in
     `public/engine/`, is populated by `npm run setup:engine:swift`, and is
     copied into `dist/client/engine/`.

You do **not** need to set COOP/COEP / cross-origin isolation
headers. An earlier draft of the engine used `SharedArrayBuffer`
which required `Cross-Origin-Embedder-Policy: require-corp`; the
current BusyTeX worker doesn't, and the SwiftLaTeX fallback also
runs without isolation in our wrapper.

## Per-host configuration

### Netlify

Two files in the project root (committed to the deploy branch):

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/ctan/*"
  to = "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/:splat"
  status = 200
  force = true

# SPA fallback - must come AFTER the /ctan/* rule.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Cloudflare Pages

`_redirects` at the root of `dist/`:

```
/ctan/*  https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/:splat  200
/*       /index.html                                                  200
```

(Cloudflare evaluates rules top-to-bottom; the `/ctan/*` rule must
come before the SPA fallback.)

### Vercel

`vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/ctan/(.*)",
      "destination": "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/$1"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### nginx

```nginx
location /ctan/ {
  proxy_pass https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/;
  proxy_set_header Host mirrors.up.pt;
  proxy_ssl_server_name on;
}

location / {
  try_files $uri /index.html;
}
```

## Engine hosting

The default static-host upload is `dist/client/`. The production build contains
the compact SwiftLaTeX runtime. BusyTeX is intentionally excluded because its
full TeX Live payload is unsuitable for the Sites artifact.

1. **Use the bundled SwiftLaTeX runtime.** This is the supported default and
   fetches missing packages through the same-origin CTAN proxy.
2. **Serve BusyTeX from a sibling origin** (for example, an object store or CDN).
   CloudFront, GitHub Releases). Provide the BusyTeX base URL via
   the `busytexBasePath` option when constructing the compile
   service; CORS is fine because the static engine files are
   plain JSON/JS/WASM that the host can serve with
   `Access-Control-Allow-Origin: *`. This keeps the SPA upload
   under a few MB and the cache hit-rate on the engine high.

When BusyTeX is absent, engine selection automatically uses SwiftLaTeX.

## CTAN mirror choice

The default proxy target is `mirrors.up.pt` (University of Porto)
because it's a stable HTTPS-only mirror with good throughput in
Europe and the US. For deployments outside that footprint a
geographically closer mirror is usually faster:

- US: `https://mirror.las.iastate.edu/tex-archive/`
- Asia: `https://mirrors.tuna.tsinghua.edu.cn/CTAN/`
- Global redirector: `https://mirror.ctan.org/` (HTTP 302 to a
  mirror; many proxies handle redirects fine, but cache behaviour
  varies - pin to a direct mirror for predictability).

The mirror must serve `/systems/texlive/tlnet/archive/<pkg>.tar.xz`
on the same URL path; every CTAN mirror does.

## Smoke-testing the deploy

After the deploy lands, these three checks confirm the wiring:

1. `HEAD /engine/swiftlatexpdftex.worker.js` -> 200 with a JavaScript
   content type.
2. `HEAD /ctan/archive/latex.tar.xz` -> 200, content-type
   `application/x-xz`. If this returns HTML, the proxy isn't
   rewriting - re-check the redirect order.
3. Open the editor, run Compile on the default project. First-
   compile cold-start is ~25 s; subsequent compiles are 1-15 s.
   The status pill should land on `Compiled` and the preview pane
   should render a real PDF.

## Quality gate before tagging a release

```sh
npm run quality
npm run test:e2e
```

- `npm run quality` - typecheck -> lint -> format check -> dependency audit
  -> vitest with coverage -> production build. The unit-test side of the gate.
- `npm run test:e2e` - Playwright smoke tests. Builds the app for
  production, serves it via `vite preview`, opens a real headless
  Chromium, drives a real BusyTeX compile, and asserts the canvas
  paints non-zero glyphs. Catches the class of bug Vitest can't -
  bundler regressions, Worker realm issues, browser-only API
  mismatches.

Don't tag a release on a failing gate. The current thresholds:

| Metric     | Threshold |
| ---------- | --------- |
| lines      | 90%       |
| branches   | 79%       |
| functions  | 87%       |
| statements | 88%       |

The first Playwright run downloads ~110 MB of Chromium binaries via
`npx playwright install chromium`. CI runners that cache
`~/.cache/ms-playwright` skip the download on subsequent jobs.
