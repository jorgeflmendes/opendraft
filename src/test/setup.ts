import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { MOCK_PROJECT_ENTRIES } from "@/lib/mock/projects";
import {
  CompositeProjectService,
  MemoryKVStore,
  PersistenceProjectStore,
  setProjectService,
  type SavedProject,
} from "@/services";

// Use the real persistence service semantics over isolated in-memory storage.
beforeEach(() => {
  const kv = new MemoryKVStore<SavedProject>();
  const store = new PersistenceProjectStore(kv);
  setProjectService(new CompositeProjectService(MOCK_PROJECT_ENTRIES, store));
});

afterEach(() => {
  cleanup();
  setProjectService(null);
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-density");
});

// Deterministic browser API shims for jsdom.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!window.PointerEvent) {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
}

if (!URL.createObjectURL) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:opendraft-test",
  });
}
if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
}

const emptyClientRectList = Object.assign([], {
  item: () => null,
}) as DOMRectList;

const zeroDomRect = () =>
  ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  }) as DOMRect;

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => emptyClientRectList;
}

if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = zeroDomRect;
}
