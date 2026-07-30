import { describe, it, expect, beforeAll } from "vitest";

// Importing the polyfill for side effects only.
beforeAll(async () => {
  await import("./uint8-hex");
});

describe("Uint8Array#toHex polyfill", () => {
  it("encodes bytes as a lowercase hex string", () => {
    const bytes = new Uint8Array([0, 0x0f, 0xff, 0xa5, 0x10]);
    // Cast is ours - the polyfill installs the proposal method on
    // The runtime can expose this method before TypeScript ships its declaration.
    // on every target.
    expect((bytes as unknown as { toHex(): string }).toHex()).toBe("000fffa510");
  });

  it("returns an empty string for an empty array", () => {
    expect((new Uint8Array(0) as unknown as { toHex(): string }).toHex()).toBe("");
  });

  it("zero-pads single-digit nibbles", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x0a]);
    expect((bytes as unknown as { toHex(): string }).toHex()).toBe("01020a");
  });
});

describe("Uint8Array.fromHex polyfill", () => {
  it("decodes a hex string into a Uint8Array", () => {
    const Ctor = Uint8Array as unknown as { fromHex(hex: string): Uint8Array };
    expect(Array.from(Ctor.fromHex("000fffa510"))).toEqual([0, 0x0f, 0xff, 0xa5, 0x10]);
  });

  it("rejects odd-length input", () => {
    const Ctor = Uint8Array as unknown as { fromHex(hex: string): Uint8Array };
    expect(() => Ctor.fromHex("abc")).toThrow(SyntaxError);
  });

  it("rejects non-hex characters", () => {
    const Ctor = Uint8Array as unknown as { fromHex(hex: string): Uint8Array };
    expect(() => Ctor.fromHex("zzzz")).toThrow(SyntaxError);
  });

  it("round-trips with toHex", () => {
    const original = new Uint8Array([10, 20, 30, 40, 200, 255]);
    const hex = (original as unknown as { toHex(): string }).toHex();
    const back = (Uint8Array as unknown as { fromHex(hex: string): Uint8Array }).fromHex(hex);
    expect(Array.from(back)).toEqual(Array.from(original));
  });
});
