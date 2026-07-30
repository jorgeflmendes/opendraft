import { test, expect, type Page } from "@playwright/test";
import { makeStokesNotes } from "../../src/lib/mock/project";
import { serializeProject } from "../../src/services/project-io";

// Exercises the production bundle, real TeX/PDF workers, and canvas output.
const DARK_PIXEL_THRESHOLD = 500;

async function openDefaultProject(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /open project workspace/i }).click();
  await page.getByRole("button", { name: /new project/i }).click();
  await page.getByPlaceholder(/project name/i).fill("Compile Smoke");
  await page.getByRole("button", { name: /create/i, exact: true }).click();
  await expect(page.getByText("Files", { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function importCompileFixture(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /open project workspace/i }).click();
  const fixture = await serializeProject(makeStokesNotes());
  await page.getByLabel("Import OpenDraft project").setInputFiles({
    name: "compile-fixture.opendraft.json",
    mimeType: "application/json",
    buffer: Buffer.from(fixture),
  });
  await expect(page.getByText("Files", { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function clickCompile(page: Page) {
  const btn = page.getByRole("button", { name: /^Compile project$/ });
  await btn.click();
}

async function darkPixelsOnCanvas(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      ".od-pdf-document .page canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] ?? 255) < 200) dark++;
    }
    return dark;
  });
}

async function selectPdfTextAndAssertAlignment(page: Page) {
  const textSpans = page.locator(".od-pdf-document .page .textLayer span");
  await expect.poll(() => textSpans.count()).toBeGreaterThan(0);
  await textSpans.first().scrollIntoViewIfNeeded();
  const findVisibleSpan = () =>
    page.evaluate(() => {
      const containerRect = document.querySelector(".od-pdf-container")?.getBoundingClientRect();
      if (!containerRect) return -1;
      return Array.from(
        document.querySelectorAll(".od-pdf-document .page .textLayer span"),
      ).findIndex((span) => {
        const rect = span.getBoundingClientRect();
        return (
          rect.width > 20 &&
          rect.height > 4 &&
          Math.min(rect.right, containerRect.right) - Math.max(rect.left, containerRect.left) >
            20 &&
          rect.top >= containerRect.top + 2 &&
          rect.bottom <= containerRect.bottom - 2
        );
      });
    });
  await expect
    .poll(findVisibleSpan, { message: "A selectable PDF text span should be visible" })
    .toBeGreaterThanOrEqual(0);
  const visibleSpanIndex = await findVisibleSpan();
  const textSpan = textSpans.nth(visibleSpanIndex);
  await expect(textSpan).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pageElement = document.querySelector(".od-pdf-document .page");
          const canvas = pageElement?.querySelector("canvas");
          const textLayer = pageElement?.querySelector(".textLayer");
          if (!pageElement || !canvas || !textLayer) return false;
          const pageRect = pageElement.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          const textRect = textLayer.getBoundingClientRect();
          return [canvasRect, textRect].every(
            (rect) =>
              Math.abs(rect.left - pageRect.left) <= 1 &&
              Math.abs(rect.top - pageRect.top) <= 1 &&
              Math.abs(rect.width - pageRect.width) <= 1 &&
              Math.abs(rect.height - pageRect.height) <= 1,
          );
        }),
      { message: "PDF canvas and text layer should share page geometry" },
    )
    .toBe(true);

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const box = await textSpan.boundingBox();
  const containerBox = await page.locator(".od-pdf-container").boundingBox();
  expect(box).not.toBeNull();
  expect(containerBox).not.toBeNull();
  if (!box || !containerBox) return;

  const y = box.y + box.height / 2;
  const startX = Math.max(box.x + 2, containerBox.x + 2);
  const endX = Math.min(box.x + box.width - 2, containerBox.x + containerBox.width - 2);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();

  const selection = await page.evaluate(() => {
    const range = window.getSelection()?.rangeCount
      ? window.getSelection()?.getRangeAt(0)
      : undefined;
    const pageElement = range?.commonAncestorContainer.parentElement?.closest(".page");
    if (!range || !pageElement) return null;
    const pageRect = pageElement.getBoundingClientRect();
    const selectionRects = Array.from(range.getClientRects()).map((rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }));
    return {
      text: window.getSelection()?.toString() ?? "",
      page: {
        left: pageRect.left,
        top: pageRect.top,
        right: pageRect.right,
        bottom: pageRect.bottom,
      },
      selectionRects,
    };
  });

  expect(selection?.text.trim().length).toBeGreaterThan(0);
  expect(selection?.selectionRects.length).toBeGreaterThan(0);
  expect(
    selection?.selectionRects.every(
      (rect) =>
        rect.left >= selection.page.left - 1 &&
        rect.top >= selection.page.top - 1 &&
        rect.right <= selection.page.right + 1 &&
        rect.bottom <= selection.page.bottom + 1,
    ),
  ).toBe(true);
}

test.describe("compile -> render smoke", () => {
  test("native browser: PDF canvas and selectable text stay aligned while zooming", async ({
    page,
  }) => {
    await openDefaultProject(page);
    await clickCompile(page);

    // Pixel content prevents a blank, correctly sized canvas from passing.
    await expect
      .poll(async () => darkPixelsOnCanvas(page), {
        message: "PDF canvas should contain rendered glyphs",
        intervals: [1_000, 2_000, 5_000],
        timeout: 75_000,
      })
      .toBeGreaterThan(DARK_PIXEL_THRESHOLD);

    await selectPdfTextAndAssertAlignment(page);

    const zoom = page.getByLabel("Zoom percentage");
    await zoom.fill("150");
    await zoom.press("Enter");
    await expect(zoom).toHaveValue("150");
    await selectPdfTextAndAssertAlignment(page);
  });

  test("resolves CTAN runtime data for an imported multi-file project", async ({ page }) => {
    await importCompileFixture(page);
    await clickCompile(page);

    await expect
      .poll(async () => darkPixelsOnCanvas(page), {
        message: "Imported compile fixture should render a non-blank PDF",
        intervals: [1_000, 2_000, 5_000],
        timeout: 75_000,
      })
      .toBeGreaterThan(DARK_PIXEL_THRESHOLD);
    await expect(page.getByText(/compile failed/i)).toHaveCount(0);
  });

  test("uses our polyfill wrapper as pdf.js's workerSrc", async ({ page }) => {
    // Page polyfills do not cross worker realms; require the compatibility wrapper.
    await openDefaultProject(page);
    await clickCompile(page);
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            type GW = { GlobalWorkerOptions?: { workerSrc?: string } };
            const w = window as unknown as { pdfjsLib?: GW };
            return w.pdfjsLib?.GlobalWorkerOptions?.workerSrc ?? "";
          }),
        { timeout: 60_000, intervals: [500, 1_000, 2_000] },
      )
      .toMatch(/pdf-worker-entry/);
  });
});
