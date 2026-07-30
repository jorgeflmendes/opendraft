import { Fragment, type ReactNode } from "react";

interface StatusBarProps {
  items: ReactNode[];
}

// Generic dotted-separator status bar. Caller chooses what to put in
// each slot while keeping the status component domain-neutral.
export function StatusBar({ items }: StatusBarProps) {
  return (
    <div className="od-status" role="status" aria-live="polite">
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className={`seg od-status-segment od-status-segment--${i + 1}`}>{item}</span>
          {i < items.length - 1 && (
            <span
              className={`od-status-separator od-status-separator--${i + 1}`}
              aria-hidden="true"
            >
              ·
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
