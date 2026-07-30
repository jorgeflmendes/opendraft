import { describe, it, expect } from "vitest";
import { parseSynctexText } from "./synctex";

// Sample synctex payload covering a 2-page document with 2 input
// files. Coordinates are chosen so the math is easy to follow:
//   - Page 1 has a vbox covering most of the page (4M..96M sp).
//     Inside it, an hbox at line 5 covers x=10M..40M sp, y=20M sp.
//   - Page 2 has a single hbox at line 3 of intro.tex covering
//     x=15M..30M sp, y=10M sp.
// 1 pt = 65 536 sp, so 1M sp ≈ 15.26 pt.

const SAMPLE = `SyncTeX Version:1
Input:1:./main.tex
Input:2:./chapters/intro.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:100000000,100000000,0
(1,5:10000000,20000000:30000000,2000000,500000
h1,5:10000000,20000000:30000000,2000000,500000
)
]
}
{2
[2,1:0,0:100000000,100000000,0
(2,3:15000000,10000000:15000000,1000000,250000
)
]
}
`;

describe("parseSynctexText", () => {
  it("normalises BusyTeX's virtual project root in Input records", () => {
    const text = SAMPLE.replace(
      "Input:1:./main.tex",
      "Input:1:/home/web_user/project_dir/./main.tex",
    );
    const idx = parseSynctexText(text)!;
    expect(idx.forward("main.tex", 5)).not.toHaveLength(0);
    expect(idx.reverse(1, 15_000_000 / 65_536, 19_000_000 / 65_536)?.path).toBe("main.tex");
  });

  it("indexes pageCount from the highest seen page number", () => {
    const idx = parseSynctexText(SAMPLE)!;
    expect(idx.pageCount).toBe(2);
  });

  it("maps Input tags to the path the forward lookup uses, stripping ./", () => {
    const idx = parseSynctexText(SAMPLE)!;
    const hits = idx.forward("main.tex", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.path).toBe("main.tex");
    // ./ prefix on caller-supplied paths is forgiving:
    expect(idx.forward("./main.tex", 5).length).toBe(hits.length);
  });

  it("converts SyncTeX sp coordinates into PDF points", () => {
    const idx = parseSynctexText(SAMPLE)!;
    const hits = idx.forward("main.tex", 5);
    const rect = hits[0]!;
    // x = 10_000_000 sp / 65 536 ≈ 152.59 pt
    expect(rect.x).toBeCloseTo(10_000_000 / 65_536, 4);
    expect(rect.w).toBeCloseTo(30_000_000 / 65_536, 4);
    // height = (h + d) / 65536
    expect(rect.h).toBeCloseTo((2_000_000 + 500_000) / 65_536, 4);
    expect(rect.page).toBe(1);
  });

  it("forward() returns multiple rectangles for the same source line", () => {
    const text = SAMPLE.replace(
      "h1,5:10000000,20000000:30000000,2000000,500000\n",
      "h1,5:10000000,20000000:30000000,2000000,500000\nh1,5:50000000,30000000:20000000,2000000,500000\n",
    );
    const idx = parseSynctexText(text)!;
    expect(idx.forward("main.tex", 5)).toHaveLength(3); // 2 hboxes + 1 vbox (the wrapping `(`)
  });

  it("forward() returns an empty array for an unknown line", () => {
    const idx = parseSynctexText(SAMPLE)!;
    expect(idx.forward("main.tex", 999)).toEqual([]);
  });

  it("reverse() picks the smallest record that contains the point", () => {
    const idx = parseSynctexText(SAMPLE)!;
    // The hbox at line 5 covers x≈[152.6, 610.4] pt, y around 305 pt.
    // SyncTeX stores the baseline-origin; visible top is y-h. Click
    // a point inside the hbox.
    const x = 15_000_000 / 65_536;
    const y = 19_000_000 / 65_536; // just under the baseline
    const hit = idx.reverse(1, x, y);
    expect(hit).not.toBeNull();
    expect(hit!.path).toBe("main.tex");
    expect(hit!.line).toBe(5);
  });

  it("reverse() returns null for a click outside every box", () => {
    const idx = parseSynctexText(SAMPLE)!;
    expect(idx.reverse(1, -50, -50)).toBeNull();
  });

  it("reverse() returns null for a page that the document doesn't have", () => {
    const idx = parseSynctexText(SAMPLE)!;
    expect(idx.reverse(99, 0, 0)).toBeNull();
  });

  it("pageRecords() returns every record on the given page", () => {
    const idx = parseSynctexText(SAMPLE)!;
    const p1 = idx.pageRecords(1);
    expect(p1.length).toBeGreaterThan(0);
    expect(p1.every((r) => r.page === 1)).toBe(true);
    expect(idx.pageRecords(2).length).toBeGreaterThan(0);
  });

  it("returns null for a malformed payload without a Content section", () => {
    expect(parseSynctexText("Input:1:./main.tex\n")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseSynctexText("")).toBeNull();
  });

  it("tolerates unknown record types without crashing", () => {
    const text = SAMPLE.replace("Content:\n", "Content:\nWeird?N,5:0,0\n");
    expect(parseSynctexText(text)).not.toBeNull();
  });
});

describe("parseSynctex (async, gzipped)", () => {
  it("decompresses + parses a gzipped payload identically to the text path", async () => {
    const { parseSynctex } = await import("./synctex");
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(SAMPLE));
        controller.close();
      },
    });
    const stream = source.pipeThrough(new CompressionStream("gzip"));
    const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
    const idx = await parseSynctex(gzipped);
    expect(idx).not.toBeNull();
    expect(idx!.pageCount).toBe(2);
    expect(idx!.forward("main.tex", 5).length).toBeGreaterThan(0);
  });

  it("returns null for an empty buffer", async () => {
    const { parseSynctex } = await import("./synctex");
    expect(await parseSynctex(new Uint8Array(0))).toBeNull();
  });

  it("returns null for non-gzip bytes (decompression throws)", async () => {
    const { parseSynctex } = await import("./synctex");
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await parseSynctex(junk)).toBeNull();
  });
});
