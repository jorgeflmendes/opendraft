// Vite bundles this file as a Web Worker via the `?worker&url`
// import in PdfRenderer.tsx. The worker has its own JS realm, so
// PDF.js compatibility shims must be installed here as well as in
// the page entry point.

import "./collection-upsert";

const HEX_TABLE: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

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
      for (let i = 0; i < this.length; i++) out += HEX_TABLE[this[i]!];
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

// Side-effect import: pulls in pdfjs's worker, which registers its
// own `self.onmessage` etc. against the now-polyfilled global. The
// pdfjs subpath has no .d.ts; the ts-expect-error is the standard
// shape for ESM worker-only side-effect imports.
// @ts-expect-error - pdfjs ships no types for the worker bundle.
await import("pdfjs-dist/build/pdf.worker.mjs");
