import { isTextProjectPath } from "@/services/file-classification";

export function isTextExtension(filename: string): boolean {
  return isTextProjectPath(filename);
}

/**
 * Preserve binary uploads as bytes. FileReader is retained for compatibility
 * with the jsdom version used by the test environment.
 */
export async function readFileForProject(file: File): Promise<string | Uint8Array> {
  if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds the 50MB limit");
  if (isTextExtension(file.name)) {
    return await readAsText(file);
  }
  const buffer = await readAsArrayBuffer(file);
  return new Uint8Array(buffer);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error("FileReader returned non-ArrayBuffer"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Flatten an uploaded name, normalize unsafe characters, and add a numeric
 * suffix until the project-relative path is unique.
 */
export function uniqueUploadPath(
  filename: string,
  existing: ReadonlyArray<string>,
  prefix = "",
): string {
  const base = sanitiseFilename(filename);
  const directory = prefix.endsWith("/") ? prefix : prefix ? `${prefix}/` : "";
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? "" : base.slice(dot);
  const set = new Set(existing);
  let candidate = `${directory}${stem}${ext}`;
  let i = 1;
  while (set.has(candidate)) {
    candidate = `${directory}${stem}-${i}${ext}`;
    i++;
  }
  return candidate;
}

function sanitiseFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? raw;
  // Limit names to a cross-platform subset accepted by TeX path resolution.
  return base.replace(/[\s]+/g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
}
