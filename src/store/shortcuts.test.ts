import { beforeEach, describe, expect, it } from "vitest";
import { shortcutDefaults } from "@/features/shortcuts/shortcut-registry";
import { effectiveShortcutBindings, findShortcutConflict, useShortcutStore } from "./shortcuts";

describe("shortcut store", () => {
  beforeEach(() => {
    useShortcutStore.getState().resetAll();
  });

  it("uses Overleaf-compatible defaults for supported actions", () => {
    const bindings = effectiveShortcutBindings({});
    expect(bindings["workspace.compile"]).toEqual(["Mod+.", "Mod+S", "Mod+Enter"]);
    expect(bindings["editor.toggleComment"]).toEqual(["Mod+/"]);
    expect(bindings["editor.bold"]).toEqual(["Mod+B"]);
  });

  it("supports multiple custom bindings and removes duplicates", () => {
    useShortcutStore.getState().setBindings("workspace.compile", ["Mod+R", "Ctrl+R", "Mod+Enter"]);
    expect(useShortcutStore.getState().overrides["workspace.compile"]).toEqual([
      "Mod+R",
      "Mod+Enter",
    ]);
  });

  it("can disable and restore one action", () => {
    useShortcutStore.getState().setBindings("editor.bold", []);
    expect(effectiveShortcutBindings(useShortcutStore.getState().overrides)["editor.bold"]).toEqual(
      [],
    );
    useShortcutStore.getState().resetBinding("editor.bold");
    expect(effectiveShortcutBindings(useShortcutStore.getState().overrides)["editor.bold"]).toEqual(
      shortcutDefaults()["editor.bold"],
    );
  });

  it("detects conflicts across workspace and editor scopes", () => {
    const bindings = effectiveShortcutBindings({});
    expect(findShortcutConflict(bindings, "editor.bold", "Mod+S")).toEqual({
      id: "workspace.compile",
      label: "Compile project",
    });
  });

  it("allows the same key in independent editor and PDF scopes", () => {
    const bindings = effectiveShortcutBindings({});
    expect(findShortcutConflict(bindings, "pdf.nextPage", "Mod+B")).toBeNull();
  });
});
