import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const icon = await readFile(resolve(root, "public", "favicon.svg"), "utf8");
const output = resolve(root, "public", "og.png");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
          body {
            display: grid;
            place-items: center;
            color: #f8f4ef;
            background:
              radial-gradient(circle at 83% 18%, rgba(168, 79, 50, 0.34), transparent 34%),
              linear-gradient(135deg, #171412 0%, #25201c 58%, #151311 100%);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            position: relative;
            display: grid;
            grid-template-columns: 190px 1fr;
            gap: 48px;
            align-items: center;
            width: 1080px;
            min-height: 430px;
            padding: 58px 64px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            border-radius: 34px;
            background: rgba(31, 27, 24, 0.88);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.32);
          }
          main::after {
            content: "";
            position: absolute;
            right: 52px;
            bottom: 42px;
            width: 170px;
            height: 5px;
            border-radius: 999px;
            background: #a84f32;
          }
          .icon { width: 190px; height: 190px; filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.26)); }
          .icon svg { display: block; width: 100%; height: 100%; }
          .eyebrow {
            margin: 0 0 18px;
            color: #d89a84;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }
          h1 {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 82px;
            font-weight: 600;
            line-height: 0.98;
            letter-spacing: -0.045em;
          }
          p {
            max-width: 650px;
            margin: 26px 0 0;
            color: #d9d0c8;
            font-size: 28px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <main>
          <div class="icon" aria-hidden="true">${icon}</div>
          <section>
            <div class="eyebrow">Local-first LaTeX workspace</div>
            <h1>OpenDraft</h1>
            <p>Write, compile and review technical documents entirely in your browser.</p>
          </section>
        </main>
      </body>
    </html>`);
  await page.screenshot({ path: output, type: "png" });
} finally {
  await browser.close();
}

console.log(`Generated ${output}`);
