#!/usr/bin/env node
// Provision the SwiftLaTeX worker and the local assets it needs at runtime.
// This fork delegates missing-file resolution to the host through its
// `downloadFromCTAN` protocol; src/services/ctan-fetcher.ts implements that side.
//
// Files provisioned into public/engine/:
//   swiftlatexpdftex.worker.js    WASM-inlined worker
//   swiftlatexpdftex.fmt          pre-built pdfLaTeX format
//   texlive-index.json            filename-to-package map
//
// The index is built locally from texlive.tlpdb and reduced to a JSON object
// keyed by basename; the source database is not shipped.

import { mkdir, stat, writeFile, unlink, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const WORKER_URL =
  "https://raw.githubusercontent.com/gboyd068/obsidian-swiftlatex-render/main/swiftlatexpdftex.worker.js";
const FMT_URL =
  "https://raw.githubusercontent.com/gboyd068/Texlive-Ondemand/master/swiftlatexpdftex.fmt";

// Pin the same TLNET mirror used by the development and production proxies.
const TLPDB_URL = "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/tlpkg/texlive.tlpdb";

const BINARY_FILES = [
  {
    name: "swiftlatexpdftex.worker.js",
    url: WORKER_URL,
    minSize: 1_000_000,
    hash: "5a094e5ba9c29f208081eae080230048e52dcc57906c7c03127c18021fc2cc2e",
  },
  { name: "swiftlatexpdftex.fmt", url: FMT_URL, minSize: 1_000_000 },
];

const force = argv.includes("--force");
const swiftOnly = argv.includes("--swift-only");
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = resolve(here, "..", "public", "engine");
const busyTexOutDir = resolve(here, "..", "public", "core");
const busyTexVersion = require("texlyre-busytex/package.json").version;
const busyTexVersionFile = join(busyTexOutDir, ".busytex-version");

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function fetchToFile(url, dest, expectedHash) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  let buf = new Uint8Array(await res.arrayBuffer());
  if (dest.endsWith("swiftlatexpdftex.worker.js")) {
    const text = new TextDecoder("utf-8").decode(buf);
    const patched = text
      .replace("ENVIRONMENT_IS_WORKER=false", "ENVIRONMENT_IS_WORKER=true")
      .replace("ENVIRONMENT_IS_NODE=true", "ENVIRONMENT_IS_NODE=false");
    if (patched === text) {
      throw new Error(
        `Could not patch ${dest} — upstream worker layout changed; rerun setup:engine after updating the patch.`,
      );
    }
    buf = new TextEncoder().encode(patched);
  }

  if (expectedHash) {
    const actualHash = createHash("sha256").update(buf).digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error("Hash mismatch");
    }
  }

  await writeFile(dest, buf);
  return buf.byteLength;
}

async function alreadyHave(dest, minSize) {
  try {
    const s = await stat(dest);
    return s.size >= minSize;
  } catch {
    return false;
  }
}

/**
 * Stream-parse TeX Live tlpdb into a basename→packages map.
 *
 * tlpdb is a flat text database; each package block looks like:
 *   name foo
 *   category Package
 *   ...
 *   runfiles size=NN
 *    texmf-dist/tex/latex/foo/foo.cls
 *    texmf-dist/tex/latex/foo/foo.sty
 *   <blank line>
 *
 * We keep only the basename. Multiple packages may ship a file of the
 * same name (rare); the value is an array so callers can probe.
 */
function addToIndex(index, key, pkg) {
  if (!key) return;
  const list = index[key];
  if (!list) {
    index[key] = [pkg];
  } else if (!list.includes(pkg)) {
    list.push(pkg);
  }
}

function buildIndex(tlpdbText) {
  const index = Object.create(null);
  let pkg = null;
  let inRunfiles = false;
  const lines = tlpdbText.split("\n");
  for (const line of lines) {
    if (line.startsWith("name ")) {
      pkg = line.slice(5).trim();
      inRunfiles = false;
      continue;
    }
    if (line.startsWith("runfiles")) {
      inRunfiles = true;
      continue;
    }
    if (line.startsWith(" ")) {
      if (!inRunfiles || !pkg) continue;
      const file = line.trim();
      if (!file) continue;
      const b = basename(file);
      if (file.startsWith("bin/")) continue;
      addToIndex(index, b, pkg);
      // pdfTeX's `kpse_find_pk_impl` asks for font names *without* an
      // extension (e.g. "msbm10" not "msbm10.pk"). Index any
      // ".tfm" / ".pfb" / ".afm" entry under its extensionless stem
      // too, so the runtime fetcher can resolve those requests
      // back to the right package.
      const dot = b.lastIndexOf(".");
      if (dot > 0) {
        const ext = b.slice(dot + 1).toLowerCase();
        if (ext === "tfm" || ext === "pfb" || ext === "afm" || ext === "vf") {
          addToIndex(index, b.slice(0, dot), pkg);
        }
      }
      continue;
    }
    inRunfiles = false;
  }
  return index;
}

async function downloadTlpdbAndBuildIndex(indexDest) {
  process.stdout.write(`  ↓ texlive.tlpdb (parsing locally) … `);
  const res = await fetch(TLPDB_URL);
  if (!res.ok) throw new Error(`${TLPDB_URL} → HTTP ${res.status}`);
  const text = await res.text();
  process.stdout.write(`${(text.length / 1024 / 1024).toFixed(1)} MB read, building index … `);
  const index = buildIndex(text);
  const json = JSON.stringify(index);
  await writeFile(indexDest, json, "utf8");
  console.log(
    `${Object.keys(index).length} files → ${(json.length / 1024 / 1024).toFixed(2)} MB JSON`,
  );
}

/**
 * Build the consolidated pdftex.map from a handful of common font
 * packages. pdfTeX opens this file directly at shipout time (not via
 * kpse), so it must be on disk under TEXCACHEROOT before the first
 * compile. On a normal TeX Live install the file is generated by
 * `updmap` from .map fragments scattered across packages. We do the
 * same here at install time so the browser doesn't have to.
 */
const MAP_SOURCES = [
  // Base Computer Modern and AMS mappings required by bundled templates.
  {
    pkg: "amsfonts",
    paths: [
      "fonts/map/dvips/amsfonts/cm.map",
      "fonts/map/dvips/amsfonts/symbols.map",
      "fonts/map/dvips/amsfonts/cmextra.map",
      "fonts/map/dvips/amsfonts/euler.map",
      "fonts/map/dvips/amsfonts/latxfont.map",
    ],
  },
];

async function buildPdftexMap(mapDest) {
  process.stdout.write(`  ↓ pdftex.map (synthesised from font packages) … `);
  const sections = [];
  for (const src of MAP_SOURCES) {
    const url = `https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet/archive/${src.pkg}.tar.xz`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const xzBytes = new Uint8Array(await res.arrayBuffer());
    const tar = await xzDecompressNode(xzBytes);
    for (const want of src.paths) {
      const content = extractTarFile(tar, want);
      if (content) sections.push(`% --- from ${src.pkg}: ${want} ---\n` + content);
    }
  }
  const synthesised =
    "% pdftex.map — synthesised at install time by scripts/setup-engine.mjs.\n" +
    "% Lines below are concatenated verbatim from CTAN font packages.\n\n" +
    sections.join("\n");
  await writeFile(mapDest, synthesised, "utf8");
  console.log(`${(synthesised.length / 1024).toFixed(1)} KB`);
}

/**
 * Decompress an xz payload with the host executable. Repository setup requires
 * `xz` on PATH; keeping it outside runtime dependencies avoids shipping a
 * second decoder solely for this provisioning script.
 */
async function xzDecompressNode(bytes) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolveBytes, rejectBytes) => {
    try {
      const proc = spawn("xz", ["-d", "-c"], { stdio: ["pipe", "pipe", "pipe"] });
      const chunks = [];
      proc.stdout.on("data", (c) => chunks.push(c));
      proc.on("error", rejectBytes);
      proc.on("close", (code) => {
        if (code !== 0) return rejectBytes(new Error(`xz exited with ${code}`));
        resolveBytes(Buffer.concat(chunks));
      });
      proc.stdin.end(Buffer.from(bytes));
    } catch (e) {
      rejectBytes(e);
    }
  });
}

/**
 * Walk a tar archive in memory and pull one entry by exact path.
 * Handles ustar + GNU long-name (`L`) — same dialect as TeX Live
 * containers. Returns the entry contents as a UTF-8 string, or null.
 */
function extractTarFile(tar, wantedPath) {
  const BLOCK = 512;
  let pos = 0;
  let pendingLongName = null;
  while (pos + BLOCK <= tar.length) {
    if (isZeroBlock(tar, pos)) return null;
    const rawName = readNulString(tar, pos, 100);
    const size = readOctal(tar, pos + 124, 12);
    const typeFlag = String.fromCharCode(tar[pos + 156]);
    const prefix = readNulString(tar, pos + 345, 155);
    pos += BLOCK;
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (typeFlag === "L") {
      pendingLongName = readNulString(tar, pos, size);
      pos += padded;
      continue;
    }
    const name = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    pendingLongName = null;
    if (name === wantedPath || name.endsWith("/" + wantedPath)) {
      return new TextDecoder("utf-8").decode(tar.subarray(pos, pos + size));
    }
    pos += padded;
  }
  return null;
}
function readNulString(buf, off, len) {
  let end = off;
  const limit = Math.min(off + len, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(buf.subarray(off, end));
}
function readOctal(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const b = buf[off + i] ?? 0;
    if (b === 0 || b === 0x20) break;
    s += String.fromCharCode(b);
  }
  return s ? parseInt(s, 8) : 0;
}
function isZeroBlock(buf, off) {
  const end = Math.min(off + 512, buf.length);
  for (let i = off; i < end; i++) if (buf[i] !== 0) return false;
  return true;
}

async function indexLooksValid(indexDest) {
  try {
    const s = await stat(indexDest);
    if (s.size < 500_000) return false;
    // Size alone accepts truncated caches; parsing and probing a core class does not.
    const text = await readFile(indexDest, "utf8");
    const idx = JSON.parse(text);
    return Array.isArray(idx["article.cls"]) && idx["article.cls"].length > 0;
  } catch {
    return false;
  }
}

async function main() {
  await ensureDir(outDir);
  console.log(`LaTeX engine → ${outDir}`);
  let downloaded = 0;
  let skipped = 0;

  for (const f of BINARY_FILES) {
    const dest = join(outDir, f.name);
    if (!force && (await alreadyHave(dest, f.minSize))) {
      console.log(`  ✓ ${f.name} (already present, --force to refresh)`);
      skipped++;
      continue;
    }
    process.stdout.write(`  ↓ ${f.name} … `);
    const bytes = await fetchToFile(f.url, dest, f.hash);
    if (bytes < f.minSize) {
      await unlink(dest).catch(() => {});
      throw new Error(`${f.name} only ${bytes} bytes; expected ≥ ${f.minSize}`);
    }
    console.log(`${(bytes / 1024 / 1024).toFixed(2)} MB`);
    downloaded++;
  }

  const indexDest = join(outDir, "texlive-index.json");
  if (!force && (await indexLooksValid(indexDest))) {
    console.log(`  ✓ texlive-index.json (already present, --force to refresh)`);
    skipped++;
  } else {
    await downloadTlpdbAndBuildIndex(indexDest);
    downloaded++;
  }

  const mapDest = join(outDir, "pdftex.map");
  if (!force && (await alreadyHave(mapDest, 1024))) {
    console.log(`  ✓ pdftex.map (already present, --force to refresh)`);
    skipped++;
  } else {
    await buildPdftexMap(mapDest);
    downloaded++;
  }

  // PDF.js needs these assets to render standard and mathematical fonts faithfully.
  const srcCmaps = resolve(here, "..", "node_modules/pdfjs-dist/cmaps");
  const srcStd = resolve(here, "..", "node_modules/pdfjs-dist/standard_fonts");
  const destPdfjs = resolve(here, "..", "public/pdfjs");
  await mkdir(destPdfjs, { recursive: true });
  const { cp } = await import("node:fs/promises");
  await cp(srcCmaps, join(destPdfjs, "cmaps"), { recursive: true, force: true });
  await cp(srcStd, join(destPdfjs, "standard_fonts"), { recursive: true, force: true });
  console.log(`  ✓ PDF.js cmaps/standard fonts provisioned.`);

  console.log(`Done. ${downloaded} downloaded, ${skipped} cached.`);
  if (downloaded > 0) {
    console.log("Refresh the dev server / browser to pick up the new engine.");
  }

  if (!swiftOnly) await downloadBusyTexAssets();
}

async function downloadBusyTexAssets() {
  console.log(`BusyTeX TeX Live 2026 engine → ${busyTexOutDir}`);
  try {
    await ensureDir(busyTexOutDir);
    let installedVersion = null;
    try {
      installedVersion = (await readFile(busyTexVersionFile, "utf8")).trim();
    } catch {
      // Pre-marker installations are valid and are refreshed by the downloader.
    }

    if (force) {
      await rm(join(busyTexOutDir, "busytex"), { recursive: true, force: true });
    } else if (installedVersion && installedVersion !== busyTexVersion) {
      throw new Error(
        `BusyTeX assets are ${installedVersion}, but the installed package is ${busyTexVersion}. ` +
          "Run npm run setup:engine -- --force to refresh them together.",
      );
    }

    const { downloadAssets } = require("texlyre-busytex/scripts/download-assets.cjs");
    await downloadAssets(busyTexOutDir);
    if (!(await alreadyHave(join(busyTexOutDir, "busytex", "busytex_worker.js"), 1024))) {
      throw new Error("BusyTeX setup completed without the required worker asset.");
    }
    await writeFile(busyTexVersionFile, `${busyTexVersion}\n`, "utf8");
  } catch (e) {
    throw new Error(`BusyTeX asset setup failed: ${e?.message ?? e}`);
  }
}

main().catch((e) => {
  console.error("setup:engine failed:", e?.message ?? e);
  exit(1);
});
