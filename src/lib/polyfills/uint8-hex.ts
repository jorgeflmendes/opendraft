// Polyfill `Uint8Array.prototype.toHex` and `Uint8Array.fromHex`
// for browsers without the Stage-3 proposal yet.
//
// pdfjs-dist 5.x assumes the proposal is shipped - its
// document-fingerprint code calls `hashBytes.toHex()` unconditionally
// in a browser matrix we still support.
//
// The polyfill installs only when the method is missing, so modern
// browsers get the native (faster) implementation. Implementations
// follow the spec proposal at
// Implements the TC39 Uint8Array base64/hex proposal where unavailable.
//
// Imported for side effects from `main.tsx` before any module that
// pulls in pdfjs.

const HEX_TABLE = (() => {
  const table = new Array<string>(256);
  for (let i = 0; i < 256; i++) {
    table[i] = i.toString(16).padStart(2, "0");
  }
  return table;
})();

declare global {
  interface Uint8Array {
    toHex?(): string;
  }
  interface Uint8ArrayConstructor {
    fromHex?(hex: string): Uint8Array;
  }
  interface Math {
    sumPrecise?(items: Iterable<number>): number;
  }
}

if (typeof Math.sumPrecise !== "function") {
  Math.sumPrecise = function sumPrecise(items: Iterable<number>): number {
    let sum = 0;
    for (const item of items) sum += item;
    return sum;
  };
}

if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value: function toHex(this: Uint8Array): string {
      let out = "";
      for (let i = 0; i < this.length; i++) {
        out += HEX_TABLE[this[i]!];
      }
      return out;
    },
  });
}

if (typeof Uint8Array.fromHex !== "function") {
  Object.defineProperty(Uint8Array, "fromHex", {
    configurable: true,
    writable: true,
    value: function fromHex(hex: string): Uint8Array {
      if (typeof hex !== "string") throw new TypeError("fromHex: expected a string");
      if (hex.length % 2 !== 0) throw new SyntaxError("fromHex: odd-length string");
      if (/[^0-9a-fA-F]/.test(hex)) throw new SyntaxError("fromHex: non-hex character");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    },
  });
}
