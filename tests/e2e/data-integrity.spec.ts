import { expect, test, type Browser, type Page } from "@playwright/test";

async function createProject(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /open project workspace/i }).click();
  await page.getByRole("button", { name: /new project/i }).click();
  await page.getByPlaceholder(/project name/i).fill(name);
  await page.getByRole("button", { name: /create/i, exact: true }).click();
  await expect(page.getByText("Files", { exact: true })).toBeVisible();
}

test.describe("local data integrity", () => {
  test("two tabs can edit different projects without replacing each other's session", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();
    await createProject(first, "First Project");
    await createProject(second, "Second Project");

    const secondUrl = second.url();
    await first.locator(".cm-content").click();
    await first.keyboard.type("% independent tab edit");
    await expect(first.locator(".cm-content")).toContainText("independent tab edit");

    expect(second.url()).toBe(secondUrl);
    await expect(second.getByRole("navigation", { name: /second project.*files/i })).toBeVisible();
    await expect(second.locator(".cm-content")).not.toContainText("independent tab edit");
    await context.close();
  });

  test("a saved edit survives a full browser reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open project workspace/i }).click();
    await page.getByRole("button", { name: /new project/i }).click();
    await page.getByPlaceholder(/project name/i).fill("Persistence E2E");
    await page.getByRole("button", { name: /create/i, exact: true }).click();
    await expect(page.getByText("Files", { exact: true })).toBeVisible();

    await page.locator(".cm-content").click();
    await page.keyboard.type("% persisted marker");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+s" : "Control+Alt+s");
    await expect(page.getByText(/Saved \(local\)/)).toBeVisible();

    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("persisted marker");
  });
});
