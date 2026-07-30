import type { ReactNode } from "react";
import { BrandHome, Logo } from "./Logo";

interface AppHeaderProps {
  location?: string;
  onHome?: () => void;
  title?: string;
  actions?: ReactNode;
}

/** Shared shell for landing and project-management screens. */
export function AppHeader({ location, onHome, title, actions }: AppHeaderProps) {
  return (
    <header className="od-app-header">
      {onHome ? <BrandHome onHome={onHome} /> : <Logo />}
      {title ? <h1 className="od-app-header-title">{title}</h1> : null}
      {location ? (
        <span className="od-system-path" aria-label="Current location">
          {location}
        </span>
      ) : null}
      <div className="od-header-actions">{actions}</div>
    </header>
  );
}
