import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist/build/pdf.worker.mjs", () => ({}));

const mapPrototype = Map.prototype as unknown as Record<string, unknown>;
const weakMapPrototype = WeakMap.prototype as unknown as Record<string, unknown>;

const originals = {
  mapGetOrInsertComputed: mapPrototype.getOrInsertComputed,
  weakMapGetOrInsertComputed: weakMapPrototype.getOrInsertComputed,
  toHex: Uint8Array.prototype.toHex,
  fromHex: Uint8Array.fromHex,
};

describe("pdf worker polyfill entry", () => {
  beforeEach(() => {
    vi.resetModules();
    delete mapPrototype.getOrInsertComputed;
    delete weakMapPrototype.getOrInsertComputed;
    delete Uint8Array.prototype.toHex;
    delete Uint8Array.fromHex;
  });

  afterEach(() => {
    if (originals.mapGetOrInsertComputed === undefined) delete mapPrototype.getOrInsertComputed;
    else mapPrototype.getOrInsertComputed = originals.mapGetOrInsertComputed;

    if (originals.weakMapGetOrInsertComputed === undefined)
      delete weakMapPrototype.getOrInsertComputed;
    else weakMapPrototype.getOrInsertComputed = originals.weakMapGetOrInsertComputed;

    if (originals.toHex === undefined) delete Uint8Array.prototype.toHex;
    else Uint8Array.prototype.toHex = originals.toHex;

    if (originals.fromHex === undefined) delete Uint8Array.fromHex;
    else Uint8Array.fromHex = originals.fromHex;
  });

  it("installs collection upsert helpers inside the worker realm", async () => {
    await import("./pdf-worker-entry");

    const map = new Map<string, string>();
    const key = {};
    const weakMap = new WeakMap<object, string>();

    expect(map.getOrInsertComputed?.("pdf", (value) => `${value}-worker`)).toBe("pdf-worker");
    expect(weakMap.getOrInsertComputed?.(key, () => "worker")).toBe("worker");
  });

  it("installs Uint8Array hex helpers inside the worker realm", async () => {
    await import("./pdf-worker-entry");

    expect(new Uint8Array([0, 15, 255]).toHex?.()).toBe("000fff");
    expect(Array.from(Uint8Array.fromHex?.("4869") ?? [])).toEqual([72, 105]);
  });

  it("rejects invalid fromHex input", async () => {
    await import("./pdf-worker-entry");

    expect(() => Uint8Array.fromHex?.(123 as never)).toThrow(TypeError);
    expect(() => Uint8Array.fromHex?.("f")).toThrow(SyntaxError);
    expect(() => Uint8Array.fromHex?.("zz")).toThrow(SyntaxError);
  });
});
