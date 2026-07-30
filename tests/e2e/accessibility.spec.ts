import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(
    violations,
    violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`)
            .join("\n")}`,
      )
      .join("\n\n"),
  ).toEqual([]);
}

test.describe("accessibility", () => {
  test("landing and project catalogue have no serious automated violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page.getByRole("button", { name: /open project workspace/i }).click();
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("editor has no serious automated violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open project workspace/i }).click();
    await page.getByRole("button", { name: /new project/i }).click();
    await page.getByPlaceholder(/project name/i).fill("Accessibility Project");
    await page.getByRole("button", { name: /create/i, exact: true }).click();
    await expect(page.getByText("Files", { exact: true })).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page);
  });
});
