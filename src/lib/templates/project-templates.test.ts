import { describe, it, expect } from "vitest";
import { PROJECT_TEMPLATES, seedForTemplate, type ProjectTemplateId } from "./project-templates";

describe("project templates", () => {
  it("exposes a non-empty catalogue with unique ids", () => {
    expect(PROJECT_TEMPLATES.length).toBeGreaterThan(0);
    const ids = new Set(PROJECT_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(PROJECT_TEMPLATES.length);
  });

  it.each(PROJECT_TEMPLATES.map((t) => [t.id, t.name]))(
    "seed for %s is non-empty and points at a real entry file",
    (id, name) => {
      const seed = seedForTemplate(id as ProjectTemplateId, name);
      expect(Object.keys(seed.files).length).toBeGreaterThan(0);
      expect(seed.files[seed.entry]).toBeDefined();
      expect(seed.files[seed.entry]).toContain("\\documentclass");
    },
  );

  it("interpolates the title into the document where supported", () => {
    const seed = seedForTemplate("amsart", "On Compactness");
    expect(seed.files["main.tex"]).toContain("\\title{On Compactness}");
  });

  it("the thesis template ships a chapters folder and a refs.bib", () => {
    const seed = seedForTemplate("thesis-memoir", "Thesis Draft");
    expect(seed.entry).toBe("main.tex");
    expect(seed.files["chapters/01-introduction.tex"]).toMatch(/\\chapter\{/);
    expect(seed.files["refs.bib"]).toMatch(/@book/);
    expect(seed.files["main.tex"]).toContain("\\input{chapters/01-introduction.tex}");
  });

  it("the beamer template uses the beamer class with a Madrid theme", () => {
    const seed = seedForTemplate("beamer", "Talk");
    expect(seed.files["main.tex"]).toContain("\\documentclass[aspectratio=43]{beamer}");
    expect(seed.files["main.tex"]).toContain("\\usetheme{Madrid}");
  });
});
