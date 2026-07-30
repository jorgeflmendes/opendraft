import { test, expect, type Page } from "@playwright/test";

async function openEmptyProject(page: Page, projectName: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /open project workspace/i }).click();
  await page.getByRole("button", { name: /new project/i }).click();
  await page.getByPlaceholder(/project name/i).fill(projectName);
  await page.getByRole("button", { name: /create/i }).click();

  await expect(page.getByText("Files", { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe("Editor UI Features", () => {
  test("creates, renames, and deletes files correctly", async ({ page }) => {
    await openEmptyProject(page, "File Management E2E");

    await page.getByRole("button", { name: /new file/i }).click();
    await page.getByRole("textbox", { name: /file path/i }).fill("test-rename.tex");
    await page.getByRole("button", { name: /create/i, exact: true }).click();

    await expect(page.locator(".od-tree-name", { hasText: "test-rename.tex" })).toBeVisible();
    await expect(page.locator(".od-tab.is-active")).toHaveText(/test-rename.tex/);

    const fileRow = page.locator(".od-tree-row").filter({ hasText: "test-rename.tex" }).first();
    await fileRow.hover();
    await page.getByRole("button", { name: /actions for test-rename.tex/i }).click();

    await page.getByRole("menuitem", { name: /rename/i }).click();

    const renameInput = page.getByRole("textbox", { name: /rename test-rename.tex/i });
    await renameInput.fill("renamed.tex");
    await renameInput.press("Enter");

    await expect(page.locator(".od-tree-name", { hasText: "test-rename.tex" })).not.toBeVisible();
    await expect(page.locator(".od-tree-name", { hasText: "renamed.tex" })).toBeVisible();
    await expect(page.locator(".od-tab.is-active")).toHaveText(/renamed.tex/);

    const renamedRow = page.locator(".od-tree-row").filter({ hasText: "renamed.tex" }).first();
    await renamedRow.hover();
    await page.getByRole("button", { name: /actions for renamed.tex/i }).click();

    await page.getByRole("menuitem", { name: /delete/i }).click();
    await page.getByRole("menuitem", { name: /click again to delete/i }).click();

    await expect(page.locator(".od-tree-name", { hasText: "renamed.tex" })).not.toBeVisible();
  });
});
