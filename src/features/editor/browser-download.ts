function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export function downloadBytes(filename: string, content: Uint8Array, mime: string): void {
  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  downloadBlob(filename, new Blob([bytes.buffer], { type: mime }));
}
