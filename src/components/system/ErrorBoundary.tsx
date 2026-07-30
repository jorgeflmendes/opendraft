import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorMessage } from "@/lib/errors";

/** Contains render failures so one feature cannot unmount the entire application. */

interface BoundaryProps {
  label: string;
  children: ReactNode;
  onReset?: () => void;
  onError?: (error: unknown, info: ErrorInfo) => void;
  fallback?: (props: { error: unknown; reset: () => void }) => ReactNode;
}

interface BoundaryState {
  error: unknown;
  stack: string | null;
}

const INITIAL_STATE: BoundaryState = { error: null, stack: null };

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error, stack: null };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? null });
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState(INITIAL_STATE);
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    const error = this.state.error;
    const message = errorMessage(error);
    const stack = error instanceof Error ? (error.stack ?? "") : "";
    const details = [
      `Where: ${this.props.label}`,
      `Error: ${message}`,
      stack ? `\nStack:\n${stack}` : "",
      this.state.stack ? `\nReact component stack:${this.state.stack}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return (
      <div className="od-error-boundary" role="alert" aria-live="assertive">
        <div className="od-error-boundary-card">
          <h3 className="od-h3">Something broke in {this.props.label}</h3>
          <p className="od-error-boundary-msg">{message}</p>
          <details className="od-error-boundary-details">
            <summary>Show details</summary>
            <pre>{details}</pre>
          </details>
          <div className="od-error-boundary-actions">
            <button
              type="button"
              className="od-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(details)?.catch(() => {
                  // Clipboard can fail under permissions policy; we
                  // silently degrade - the <pre> is still selectable.
                });
              }}
            >
              Copy details
            </button>
            <button type="button" className="od-btn od-btn-primary" onClick={this.reset}>
              Try again
            </button>
            <button
              type="button"
              className="od-btn"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
