import { describe, it, expect } from "vitest";
import { readTar } from "./tar-reader";

// Hand-built tar archives so the test is fully deterministic and
// doesn't depend on Node's tar tooling. The header layout follows
// ustar / GNU long-name conventions exactly because that's the
// dialect texlive containers ship in.

const BLOCK = 512;

function pad(bytes: Uint8Array): Uint8Array {
  const rem = bytes.length % BLOCK;
  if (rem === 0) return bytes;
  const out = new Uint8Array(bytes.length + (BLOCK - rem));
  out.set(bytes);
  return out;
}

function writeOctal(view: Uint8Array, offset: number, length: number, value: number): void {
  // tar octal fields are <length-1> octal digits + NUL.
  const str = value.toString(8).padStart(length - 1, "0");
  for (let i = 0; i < length - 1; i++) view[offset + i] = str.charCodeAt(i);
  view[offset + length - 1] = 0;
}

function writeStr(view: Uint8Array, offset: number, length: number, value: string): void {
  for (let i = 0; i < Math.min(value.length, length); i++) {
    view[offset + i] = value.charCodeAt(i);
  }
}

function makeEntry(name: string, content: Uint8Array, typeFlag = "0"): Uint8Array {
  const header = new Uint8Array(BLOCK);
  writeStr(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 124, 12, content.length);
  writeOctal(header, 136, 12, 0);
  header[156] = typeFlag.charCodeAt(0);
  writeStr(header, 257, 6, "ustar");
  writeStr(header, 263, 2, "00");
  // Checksum field: 8 bytes at offset 148. Tar checksum is the sum of
  // all bytes treating the checksum field itself as spaces. We don't
  // strictly need a valid checksum for our reader, but a real archive
  // would have one and other tools assume it.
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += header[i] ?? 0;
  writeOctal(header, 148, 7, sum);
  header[155] = 0x20;

  return new Uint8Array([...header, ...pad(content)]);
}

function makeArchive(entries: Uint8Array[]): Uint8Array {
  const total = entries.reduce((n, e) => n + e.length, 0) + BLOCK * 2;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const e of entries) {
    buf.set(e, off);
    off += e.length;
  }
  // Two final zero blocks already there from default-init.
  return buf;
}

describe("readTar", () => {
  it("yields file entries with content slices", () => {
    const a = makeEntry("article.cls", new TextEncoder().encode("\\NeedsTeXFormat\n"));
    const b = makeEntry("amsmath.sty", new TextEncoder().encode("AMS"));
    const arc = makeArchive([a, b]);
    const out = [...readTar(arc)].filter((e) => e.type === "file");
    expect(out.map((e) => e.name)).toEqual(["article.cls", "amsmath.sty"]);
    expect(new TextDecoder().decode(out[0]!.content)).toBe("\\NeedsTeXFormat\n");
    expect(new TextDecoder().decode(out[1]!.content)).toBe("AMS");
  });

  it("flags directory entries with type 'dir'", () => {
    const dir = makeEntry("texmf/", new Uint8Array(), "5");
    const file = makeEntry("texmf/foo.sty", new TextEncoder().encode("FOO"));
    const out = [...readTar(makeArchive([dir, file]))];
    expect(out[0]?.type).toBe("dir");
    expect(out[1]?.type).toBe("file");
  });

  it("resolves GNU long-name entries to the next data entry", () => {
    const longName =
      "very/long/path/to/some-really-long-package-name/inside/texmf-dist/tex/latex/foo/foo.cls";
    const nameBytes = new TextEncoder().encode(longName + "\0");
    const longHeader = makeEntry("././@LongLink", nameBytes, "L");
    // The data entry's name field is ignored when a preceding L entry
    // is present, but we still write *something* to mimic real archives.
    const data = makeEntry("placeholder", new TextEncoder().encode("BODY"));
    const out = [...readTar(makeArchive([longHeader, data]))];
    const file = out.find((e) => e.type === "file");
    expect(file?.name).toBe(longName);
    expect(new TextDecoder().decode(file!.content)).toBe("BODY");
  });

  it("stops cleanly at the trailing zero blocks", () => {
    const arc = makeArchive([makeEntry("a.txt", new TextEncoder().encode("a"))]);
    const out = [...readTar(arc)];
    expect(out).toHaveLength(1);
  });
});
