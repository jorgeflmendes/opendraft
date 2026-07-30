import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapPrototype = Map.prototype as unknown as Record<string, unknown>;
const weakMapPrototype = WeakMap.prototype as unknown as Record<string, unknown>;

const originals = {
  mapGetOrInsert: mapPrototype.getOrInsert,
  mapGetOrInsertComputed: mapPrototype.getOrInsertComputed,
  weakMapGetOrInsert: weakMapPrototype.getOrInsert,
  weakMapGetOrInsertComputed: weakMapPrototype.getOrInsertComputed,
};

function restoreMethod(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) {
    delete target[key];
    return;
  }
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function clearMethods() {
  delete mapPrototype.getOrInsert;
  delete mapPrototype.getOrInsertComputed;
  delete weakMapPrototype.getOrInsert;
  delete weakMapPrototype.getOrInsertComputed;
}

describe("collection upsert polyfill", () => {
  beforeEach(() => {
    vi.resetModules();
    clearMethods();
  });

  afterEach(() => {
    restoreMethod(mapPrototype, "getOrInsert", originals.mapGetOrInsert);
    restoreMethod(mapPrototype, "getOrInsertComputed", originals.mapGetOrInsertComputed);
    restoreMethod(weakMapPrototype, "getOrInsert", originals.weakMapGetOrInsert);
    restoreMethod(weakMapPrototype, "getOrInsertComputed", originals.weakMapGetOrInsertComputed);
  });

  it("keeps existing Map values, including stored undefined", async () => {
    await import("./collection-upsert");

    const map = new Map<string, string | undefined>([["existing", undefined]]);

    expect(map.getOrInsert?.("existing", "replacement")).toBeUndefined();
    expect(map.has("existing")).toBe(true);
    expect(map.getOrInsert?.("missing", "created")).toBe("created");
    expect(map.get("missing")).toBe("created");
  });

  it("computes missing Map values exactly once", async () => {
    await import("./collection-upsert");

    const map = new Map<string, string>();
    let calls = 0;

    const first = map.getOrInsertComputed?.("doc", (key) => {
      calls += 1;
      return `${key}-value`;
    });
    const second = map.getOrInsertComputed?.("doc", () => {
      throw new Error("callback should not run for existing keys");
    });

    expect(first).toBe("doc-value");
    expect(second).toBe("doc-value");
    expect(calls).toBe(1);
  });

  it("supports WeakMap object keys", async () => {
    await import("./collection-upsert");

    const key = {};
    const weakMap = new WeakMap<object, number>();

    expect(weakMap.getOrInsert?.(key, 1)).toBe(1);
    expect(weakMap.getOrInsertComputed?.(key, () => 2)).toBe(1);
    expect(weakMap.get(key)).toBe(1);
  });

  it("rejects non-function computed callbacks for missing keys", async () => {
    await import("./collection-upsert");

    const map = new Map<string, string>();
    const weakMap = new WeakMap<object, string>();

    expect(() => map.getOrInsertComputed?.("missing", "bad" as never)).toThrow(TypeError);
    expect(() => weakMap.getOrInsertComputed?.({}, "bad" as never)).toThrow(TypeError);
  });

  it("does not replace native methods", async () => {
    const nativeLike = () => "native";
    Object.defineProperty(mapPrototype, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value: nativeLike,
    });

    await import("./collection-upsert");

    expect(mapPrototype.getOrInsertComputed).toBe(nativeLike);
  });
});
