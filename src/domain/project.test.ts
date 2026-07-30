import { describe, expect, it } from "vitest";
import { isTextContent, isBinaryContent } from "./project";

describe("project domain guards", () => {
  it("isTextContent correctly identifies strings", () => {
    expect(isTextContent("hello")).toBe(true);
    expect(isTextContent("")).toBe(true);
    expect(isTextContent(new Uint8Array())).toBe(false);
    expect(isTextContent(new Blob([""]))).toBe(false);
  });

  it("isBinaryContent correctly identifies binaries", () => {
    expect(isBinaryContent("hello")).toBe(false);
    expect(isBinaryContent(new Uint8Array([1, 2, 3]))).toBe(true);
    expect(isBinaryContent(new Blob(["test"]))).toBe(true);
  });
});
