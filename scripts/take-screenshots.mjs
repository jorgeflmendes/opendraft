import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const outDir = path.resolve("docs", "assets");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const BASE_URL = "http://127.0.0.1:4173";
const DEFAULT_PROJECT_NAME = "Stokes Notes";

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  console.log(`Navigating to ${BASE_URL}...`);
  try {
    await page.goto(BASE_URL);
  } catch (err) {
    console.error("Failed to load page. Is the preview server running on port 4173?");
    console.error(err);
    await browser.close();
    process.exit(1);
  }

  console.log("Waiting for Browse Projects button...");
  await page.getByRole("button", { name: /browse projects/i }).click();

  console.log("Taking screenshot of Projects Picker...");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, "screenshot-projects.png") });

  console.log("Navigating to the editor...");
  await page.locator(".od-list-row").filter({ hasText: DEFAULT_PROJECT_NAME }).first().click();

  console.log("Waiting for Files panel to be visible...");
  await page.getByText("Files", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(2000);
  console.log("Taking screenshot of the Editor...");
  await page.screenshot({ path: path.join(outDir, "screenshot-editor.png") });

  console.log("Compiling PDF for Hero Screenshot...");
  const compileBtn = page.getByRole("button", { name: /^Compile project$/ });
  if ((await compileBtn.count()) > 0) {
    await compileBtn.click();

    // A mounted canvas can still be blank; pixel inspection verifies rendered content.
    console.log("Waiting for PDF to render (polling canvas)...");
    let darkPixels = 0;
    const maxTries = 30;
    for (let i = 0; i < maxTries; i++) {
      darkPixels = await page.evaluate(() => {
        const canvas = document.querySelector(".od-pdf-canvas");
        if (!canvas) return 0;
        const ctx = canvas.getContext("2d");
        if (!ctx) return 0;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0;
        for (let j = 0; j < data.length; j += 4) {
          if ((data[j] ?? 255) < 200) dark++;
        }
        return dark;
      });

      if (darkPixels > 1000) {
        console.log(`Canvas painted (${darkPixels} dark pixels)!`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (darkPixels > 1000) {
      await page.waitForTimeout(1000);
      console.log("Taking Hero screenshot...");
      await page.screenshot({ path: path.join(outDir, "screenshot-hero.png") });
    } else {
      console.warn("PDF never seemed to render.");
    }
  } else {
    console.warn("Could not find compile button!");
  }

  await browser.close();
  console.log("All screenshots taken successfully!");
}

takeScreenshots().catch((err) => {
  console.error("Error taking screenshots:", err);
  process.exit(1);
});
