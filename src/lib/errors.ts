/** Convert an unknown rejection value into text safe for user-facing status UI. */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
