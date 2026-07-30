import { describe, expect, it } from "vitest";
import { editorResultLabel, editorStatusLabel } from "./editor-status";

describe("editor status labels", () => {
  it("prioritizes persistence feedback over compile state", () => {
    expect(
      editorStatusLabel({
        flashError: "disk full",
        flashNotice: "written",
        savedAt: Date.now(),
        autoSavedAt: Date.now(),
        compileStatus: "compiling",
        compileProgress: "pass 1",
      }),
    ).toBe("Save failed: disk full");
  });

  it("summarizes dirty files, diagnostics and successful duration", () => {
    const result = {
      durationLabel: "1.20s",
      log: [
        { level: "warn" as const, message: "First warning" },
        { level: "warn" as const, message: "Second warning" },
        { level: "warn" as const, message: "First warning" },
      ],
    };
    expect(editorResultLabel("warning", result, 3)).toBe("3 unsaved");
    expect(editorResultLabel("warning", result, 0)).toBe("2 warnings");
    expect(editorResultLabel("success", { ...result, log: [] }, 0)).toBe("1.20s");
  });
});
