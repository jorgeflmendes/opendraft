const MAX_DIFF_CELLS = 4_000_000;

export type DiffOpKind = "equal" | "insert" | "delete";

export interface DiffOp {
  kind: DiffOpKind;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  context: number;
}

/**
 * Diff two strings line by line. Returns the ordered op list (in
 * reading order: top of file to bottom) plus a summary count.
 *
 * CRLF is normalised to LF so a Windows-edited buffer compares
 * cleanly against a Unix file. A trailing newline is treated as
 * "no ghost line at the end" - `"a\nb\n"` and `"a\nb"` diff equal.
 */
export function diffLines(oldText: string, newText: string): { ops: DiffOp[]; stats: DiffStats } {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) {
    throw new Error("File too large for inline diff");
  }
  const lcs = buildLcs(a, b);
  const ops = walkBackwards(a, b, lcs);
  const stats = countStats(ops);
  return { ops, stats };
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const normalised = text.replace(/\r\n/g, "\n");
  const parts = normalised.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/**
 * LCS table where cell (i,j) describes prefixes a[0..i) and b[0..j).
 */
function buildLcs(a: string[], b: string[]): Int32Array {
  const n = a.length;
  const m = b.length;
  const table = new Int32Array((n + 1) * (m + 1));
  const rowLen = m + 1;
  for (let i = 1; i <= n; i++) {
    const curRow = i * rowLen;
    const prevRow = (i - 1) * rowLen;
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[curRow + j] = table[prevRow + j - 1]! + 1;
      } else {
        const up = table[prevRow + j]!;
        const left = table[curRow + j - 1]!;
        table[curRow + j] = up >= left ? up : left;
      }
    }
  }
  return table;
}

/**
 * Walk the LCS table from (n, m) back to (0, 0), emitting ops in
 * reverse, then reverse the result.
 *
 * When both up and left have the same value we prefer "delete first,
 * then insert" - same convention as git, so a change to a single
 * line shows the old version first and the new version after.
 */
function walkBackwards(a: string[], b: string[], lcs: Int32Array): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;
  const rowLen = b.length + 1;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ kind: "equal", oldLine: i - 1, newLine: j - 1, text: a[i - 1]! });
      i--;
      j--;
      continue;
    }
    const curRow = i * rowLen;
    const prevRow = (i - 1) * rowLen;
    const up = i > 0 ? lcs[prevRow + j]! : -1;
    const left = j > 0 ? lcs[curRow + j - 1]! : -1;
    if (j > 0 && (i === 0 || left >= up)) {
      ops.push({ kind: "insert", newLine: j - 1, text: b[j - 1]! });
      j--;
    } else {
      ops.push({ kind: "delete", oldLine: i - 1, text: a[i - 1]! });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

function countStats(ops: DiffOp[]): DiffStats {
  let added = 0;
  let removed = 0;
  let context = 0;
  for (const op of ops) {
    if (op.kind === "insert") added++;
    else if (op.kind === "delete") removed++;
    else context++;
  }
  return { added, removed, context };
}
