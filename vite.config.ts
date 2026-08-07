import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

// CTAN mirrors do not expose CORS headers. Development and preview therefore
// proxy package requests through the same `/ctan` boundary implemented by the
// production Sites worker.
const ctanProxyTarget = "https://mirrors.up.pt";
const ctanProxyPath = "/pub/CTAN/systems/texlive/tlnet";
const buildDirectory = fileURLToPath(new URL("./dist", import.meta.url));
const clientDirectory = fileURLToPath(new URL("./dist/client", import.meta.url));
const serverDirectory = fileURLToPath(new URL("./dist/server", import.meta.url));
const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));
const sitesWorkerFile = fileURLToPath(new URL("./src/hosting/sites-worker.ts", import.meta.url));

function deploymentBasePath(value = process.env.VITE_BASE_PATH): string {
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

const sitesWorker = (): Plugin => ({
  name: "opendraft-sites-worker",
  async buildStart() {
    await rm(buildDirectory, { recursive: true, force: true });
  },
  async closeBundle() {
    const [workerSource] = await Promise.all([
      readFile(sitesWorkerFile, "utf8"),
      mkdir(serverDirectory, { recursive: true }),
      cp(`${publicDirectory}/favicon.svg`, `${clientDirectory}/favicon.svg`),
      cp(`${publicDirectory}/og.png`, `${clientDirectory}/og.png`),
      cp(`${publicDirectory}/theme-init.js`, `${clientDirectory}/theme-init.js`),
      cp(`${publicDirectory}/pdfjs`, `${clientDirectory}/pdfjs`, { recursive: true }),
      cp(`${publicDirectory}/engine`, `${clientDirectory}/engine`, { recursive: true }),
    ]);
    const workerJavaScript = transpileModule(workerSource, {
      fileName: sitesWorkerFile,
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    }).outputText;
    await writeFile(`${serverDirectory}/index.js`, workerJavaScript);
  },
});

export default defineConfig({
  base: deploymentBasePath(),
  plugins: [react(), sitesWorker()],
  // BusyTeX's full TeX Live payload is intentionally excluded from production;
  // the compact SwiftLaTeX runtime is copied into the static artifact instead.
  publicDir: publicDirectory,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    proxy: {
      "/ctan": {
        target: ctanProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ctan/, ctanProxyPath),
      },
    },
  },
  preview: {
    proxy: {
      "/ctan": {
        target: ctanProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ctan/, ctanProxyPath),
      },
    },
  },
  build: {
    outDir: "dist/client",
    copyPublicDir: false,
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler")) return "react";
          if (id.includes("@codemirror") || id.includes("@lezer")) return "codemirror";
          if (id.includes("zustand") || id.includes("idb")) return "app-runtime";
          // Preserve feature boundaries: a catch-all vendor chunk would pull
          // lazy PDF, TeX, and math dependencies into the initial preload graph.
          return undefined;
        },
      },
    },
  },
  worker: {
    // The PDF.js wrapper installs worker-realm polyfills before dynamically
    // importing PDF.js. That code-split worker requires ES module output.
    format: "es",
  },
});
