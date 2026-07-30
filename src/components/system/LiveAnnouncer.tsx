import { useEffect, useRef, useState } from "react";
import { uniqueCompileIssues } from "@/domain";
import { useCompileStore } from "@/features/compile";

// Mirrors visual compile-state changes into one non-interrupting live region.

function describe(
  status: ReturnType<typeof useCompileStore.getState>["status"],
  result: ReturnType<typeof useCompileStore.getState>["result"],
): string | null {
  if (status === "compiling") return "Compile started.";
  if (status === "success") {
    return `Compile finished${result?.durationLabel ? ` in ${result.durationLabel}` : ""}.`;
  }
  if (status === "warning") {
    const n = result ? uniqueCompileIssues(result.log).filter((l) => l.level === "warn").length : 0;
    return `Compile finished with ${n} warning${n === 1 ? "" : "s"}.`;
  }
  if (status === "error") {
    const n = result
      ? uniqueCompileIssues(result.log).filter((l) => l.level === "error").length
      : 0;
    return `Compile failed${n > 0 ? ` with ${n} error${n === 1 ? "" : "s"}` : ""}.`;
  }
  return null;
}

export function LiveAnnouncer() {
  const status = useCompileStore((s) => s.status);
  const result = useCompileStore((s) => s.result);
  const [message, setMessage] = useState("");
  // Announce user-triggered transitions, not the initial idle state.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const next = describe(status, result);
    if (next) setMessage(next);
  }, [status, result]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="od-sr-only"
      data-testid="live-announcer"
    >
      {message}
    </div>
  );
}
