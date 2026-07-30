/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { isTextExtension, uniqueUploadPath, readFileForProject } from "./file-upload";

describe("file-upload", () => {
  it("isTextExtension identifies text files correctly", () => {
    expect(isTextExtension("main.tex")).toBe(true);
    expect(isTextExtension("style.sty")).toBe(true);
    expect(isTextExtension("refs.bib")).toBe(true);
    expect(isTextExtension("readme.md")).toBe(true);
    expect(isTextExtension("Dockerfile")).toBe(true);

    expect(isTextExtension("logo.png")).toBe(false);
    expect(isTextExtension("document.pdf")).toBe(false);
    expect(isTextExtension("unknown.dat")).toBe(false);
  });

  it("uniqueUploadPath creates unique paths when conflicts exist", () => {
    const existing = ["main.tex", "img/logo.png", "img/logo-1.png", "README"];

    expect(uniqueUploadPath("new file.tex", existing)).toBe("new-file.tex");

    expect(uniqueUploadPath("main.tex", existing)).toBe("main-1.tex");

    expect(uniqueUploadPath("logo.png", existing, "img")).toBe("img/logo-2.png");

    expect(uniqueUploadPath("README", existing)).toBe("README-1");
  });

  it("readFileForProject handles actual files and catches errors", async () => {
    const mockFile = new File(["test data"], "good.tex");

    const results = await readFileForProject(mockFile);

    expect(results).toBe("test data");

    const binaryFile = new File([new Uint8Array([1, 2, 3])], "image.png");
    const binResults = await readFileForProject(binaryFile);

    expect(binResults instanceof Uint8Array).toBe(true);
  });

  it("readFileForProject handles read errors", async () => {
    const OriginalFileReader = global.FileReader;

    try {
      class FailingFileReader {
        error: any;
        onerror: any = () => {};
        readAsText() {
          setTimeout(() => {
            this.error = new Error("Failed to read");
            this.onerror();
          }, 0);
        }
      }

      global.FileReader = FailingFileReader as unknown as any;

      const file = new File([""], "bad.tex");
      await expect(readFileForProject(file)).rejects.toThrow("Failed to read");
    } finally {
      global.FileReader = OriginalFileReader;
    }
  });

  it("readFileForProject handles missing error on FileReader", async () => {
    const OriginalFileReader = global.FileReader;
    try {
      class FailingFileReaderNoErr {
        error: any;
        onerror: any = () => {};
        readAsText() {
          setTimeout(() => {
            this.error = null;
            this.onerror();
          }, 0);
        }
      }
      global.FileReader = FailingFileReaderNoErr as unknown as any;

      const file = new File([""], "bad.tex");
      await expect(readFileForProject(file)).rejects.toThrow("read failed");
    } finally {
      global.FileReader = OriginalFileReader;
    }
  });

  it("readFileForProject reads binary files properly", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" });
    const result = await readFileForProject(file);
    expect(result instanceof Uint8Array).toBe(true);
  });
});
