import type { FileNode } from "@/domain";
import type { CompletionContext } from "@codemirror/autocomplete";
import { describe, it, expect, beforeEach } from "vitest";
import { parseFileContext, fileCompletionSource } from "./file-completion";
import { useProjectsStore } from "@/features/projects/useProjectsStore";

describe("file-completion", () => {
  beforeEach(() => {
    useProjectsStore.setState({ active: null });
  });

  it("parses file context correctly", () => {
    expect(parseFileContext("Some text")).toBeNull();
    expect(parseFileContext("\\includegraphics{test")).toEqual({
      inside: "test",
      start: 0,
      cursor: 21,
    });
    expect(parseFileContext("\\input{folder/")).toEqual({
      inside: "folder/",
      start: 0,
      cursor: 14,
    });
    expect(parseFileContext("\\bibliography{refs")).toEqual({
      inside: "refs",
      start: 0,
      cursor: 18,
    });
  });

  it("returns null when no active project", () => {
    const mockContext = {
      state: { sliceDoc: () => "\\includegraphics{test" },
      pos: 21,
    } as unknown as CompletionContext;
    expect(fileCompletionSource(mockContext)).toBeNull();
  });

  it("returns file completions", () => {
    useProjectsStore.setState({
      active: {
        id: "1",
        name: "test",
        entry: "main.tex",
        createdAt: "now",
        folders: {},
        files: {
          "logo.png": {
            path: "logo.png",
            kind: "img",
            name: "logo.png",
            id: "1",
            content: "",
          } as unknown as FileNode,
          "main.tex": {
            path: "main.tex",
            kind: "tex",
            name: "main.tex",
            id: "2",
            content: "",
          } as unknown as FileNode,
          "refs.bib": {
            path: "refs.bib",
            kind: "bib",
            name: "refs.bib",
            id: "3",
            content: "",
          } as unknown as FileNode,
        },
      },
    });

    const mockContext = {
      state: { sliceDoc: () => "\\includegraphics{l" },
      pos: 18,
    } as unknown as CompletionContext;

    const result = fileCompletionSource(mockContext);
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(1);
    expect(result!.options[0]?.label).toBe("logo.png");

    // check without matching prefix
    const mockContext2 = {
      state: { sliceDoc: () => "\\includegraphics{" },
      pos: 17,
    } as unknown as CompletionContext;
    const result2 = fileCompletionSource(mockContext2);
    expect(result2!.options).toHaveLength(3);

    // check with whitespace
    const mockContext3 = {
      state: { sliceDoc: () => "\\includegraphics{  m" },
      pos: 20,
    } as unknown as CompletionContext;
    const result3 = fileCompletionSource(mockContext3);
    expect(result3!.options[0]?.label).toBe("main.tex");
  });
});
