// Browser-safe POSIX tar reader used after CTAN xz decompression.
//
// Tar layout (ustar / pax):
//   - File is a series of 512-byte blocks.
//   - Each entry starts with a header block, then the file contents
//     padded out to a multiple of 512 bytes.
//   - Two consecutive zero-headers (or EOF) end the archive.
//   - Filenames > 100 bytes use a "long name" entry (type 'L', name
//     "././@LongLink") whose body holds the real name; the *next*
//     header carries the data.

export interface TarEntry {
  name: string;
  size: number;
  type: "file" | "dir" | "other";
  /** Immutable view into the source archive; copy before retaining independently. */
  content: Uint8Array;
}

const BLOCK = 512;

function readOctal(view: Uint8Array, offset: number, length: number): number {
  let s = "";
  for (let i = 0; i < length; i++) {
    const b = view[offset + i] ?? 0;
    if (b === 0 || b === 0x20) break;
    s += String.fromCharCode(b);
  }
  if (!s) return 0;
  return parseInt(s, 8) || 0;
}

function readString(view: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && view[end] !== 0) end++;
  // UTF-8 is backward compatible with the ASCII tar header fields.
  return new TextDecoder("utf-8").decode(view.subarray(offset, end));
}

/**
 * Walk a tar archive and yield entries lazily. The yielded
 * `content` is a Uint8Array *view* into `buffer` - copy if you need
 * to outlive the buffer.
 */
export function* readTar(buffer: Uint8Array): Generator<TarEntry> {
  let pos = 0;
  let pendingLongName: string | null = null;

  while (pos + BLOCK <= buffer.length) {
    if (isZeroBlock(buffer, pos)) {
      if (pos + 2 * BLOCK <= buffer.length && isZeroBlock(buffer, pos + BLOCK)) {
        return;
      }
      // Tolerate a non-conforming archive with only one zero block.
      pos += BLOCK;
      continue;
    }

    const rawName = readString(buffer, pos, 100);
    const size = readOctal(buffer, pos + 124, 12);
    const typeFlag = String.fromCharCode(buffer[pos + 156] ?? 0);
    const prefix = readString(buffer, pos + 345, 155);

    pos += BLOCK;
    const dataLen = size;
    const padded = Math.ceil(dataLen / BLOCK) * BLOCK;

    if (typeFlag === "L") {
      // GNU long-name bodies apply to the following header.
      const nameBytes = buffer.subarray(pos, pos + dataLen);
      let end = nameBytes.length;
      while (end > 0 && nameBytes[end - 1] === 0) end--;
      pendingLongName = new TextDecoder("utf-8").decode(nameBytes.subarray(0, end));
      pos += padded;
      continue;
    }

    const fullName = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    pendingLongName = null;

    const type: TarEntry["type"] =
      typeFlag === "0" || typeFlag === "\0" || typeFlag === ""
        ? "file"
        : typeFlag === "5"
          ? "dir"
          : "other";

    if (type === "file") {
      yield {
        name: fullName,
        size: dataLen,
        type,
        content: buffer.subarray(pos, pos + dataLen),
      };
    } else if (type === "dir") {
      yield { name: fullName, size: 0, type, content: new Uint8Array(0) };
    } else {
      yield { name: fullName, size: dataLen, type, content: new Uint8Array(0) };
    }

    pos += padded;
  }
}

function isZeroBlock(buffer: Uint8Array, offset: number): boolean {
  const end = Math.min(offset + BLOCK, buffer.length);
  for (let i = offset; i < end; i++) {
    if (buffer[i] !== 0) return false;
  }
  return true;
}
