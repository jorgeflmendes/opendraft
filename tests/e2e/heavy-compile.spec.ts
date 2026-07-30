import { test, expect, type Page } from "@playwright/test";

const HEAVY_LATEX = `
\\documentclass{article}

\\usepackage{amsmath, amssymb}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\usepackage{tikz-cd}
\\usepackage{circuitikz}

% Force package loading
\\pgfplotsset{compat=1.18}

\\begin{document}

\\section{Heavy Computation}

\\begin{tikzpicture}
\\begin{axis}[
    title={A Heavy Plot},
    xlabel=$x$, ylabel=$y$
]
\\addplot[color=red,domain=-5:5,samples=50] {x^3 - x};
\\end{axis}
\\end{tikzpicture}

\\section{TikZ-CD Diagram}
\\begin{tikzcd}
A \\arrow[r, "f"] \\arrow[d, "g"'] & B \\arrow[d, "h"] \\\\
C \\arrow[r, "k"'] & D
\\end{tikzcd}

\\section{CircuiTikZ}
\\begin{circuitikz}
\\draw (0,0) to[V,v=$U_q$] (0,2) -- (2,2)
      to[R=$R_1$] (2,0) -- (0,0);
\\end{circuitikz}

\\section{Bibliography test}
Testing citation \\cite{einstein}

\\bibliographystyle{plain}
\\bibliography{refs}

\\end{document}
`;

const REFS_BIB = `
@article{einstein,
    author = "Albert Einstein",
    title = "{Zur Elektrodynamik bewegter K{\\"o}rper}. ({German})
    [{On} the electrodynamics of moving bodies]",
    journal = "Annalen der Physik",
    volume = "322",
    number = "10",
    pages = "891--921",
    year = "1905",
    DOI = "http://dx.doi.org/10.1002/andp.19053221004"
}
`;

async function openEmptyProject(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /open project workspace/i }).click();
  await page.getByRole("button", { name: /new project/i }).click();
  await page.getByPlaceholder(/project name/i).fill("Heavy Project");
  await page.getByRole("button", { name: /create/i }).click();

  await expect(page.getByText("Files", { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe("Heavy Compile", () => {
  test("@heavy compiles complex tikz and pgfplots packages successfully", async ({ page }) => {
    test.setTimeout(180_000);

    await openEmptyProject(page);

    await page.getByRole("button", { name: /new file/i }).click();
    await page.getByRole("textbox", { name: /file path/i }).fill("refs.bib");
    await page.getByRole("button", { name: /create/i }).click();

    await expect(page.locator(".od-tab.is-active")).toHaveText(/refs.bib/);
    await page.locator(".cm-content").waitFor();
    await page.evaluate((text) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (document.querySelector(".cm-content") as any)?.cmView?.view;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else (document.querySelector(".cm-content") as any).textContent = text;
    }, REFS_BIB);

    await page
      .getByRole("navigation", { name: "Open files" })
      .getByRole("button", { name: "main.tex", exact: true })
      .click();

    await page.locator(".cm-content").waitFor();
    await expect(page.locator(".cm-content")).toContainText("documentclass", { timeout: 5000 });

    await page.evaluate((text) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (document.querySelector(".cm-content") as any)?.cmView?.view;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else (document.querySelector(".cm-content") as any).textContent = text;
    }, HEAVY_LATEX);

    await expect(page.locator(".cm-content")).toContainText("circuitikz", { timeout: 5000 });

    const btn = page.getByRole("button", { name: /^Compile project$/ });
    await btn.click();

    await expect
      .poll(
        async () => {
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
        },
        {
          message: "PDF canvas should contain rendered glyphs",
          intervals: [2_000, 5_000, 10_000],
          timeout: 120_000,
        },
      )
      .toBeGreaterThan(100);
  });
});
