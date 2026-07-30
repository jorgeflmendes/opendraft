import type { ReactNode } from "react";
import { BrandHome, Logo } from "./Logo";
import { I } from "@/components/primitives";

interface TopBarProps {
  onHome?: () => void;
  project?: string;
  filePath?: string;
  status?: ReactNode;
  right?: ReactNode;
  left?: ReactNode;
}

export function TopBar({
  onHome,
  project = "Untitled project",
  filePath,
  status,
  right,
  left,
}: TopBarProps) {
  return (
    <div className="od-topbar">
      {onHome ? <BrandHome onHome={onHome} /> : <Logo />}
      <div className="od-topbar-mid">
        {left}
        <nav aria-label="Breadcrumb" className="od-breadcrumb">
          <I.folder size={13} />
          <strong>{project}</strong>
          {filePath && (
            <>
              <span className="sep">›</span>
              <span>{filePath}</span>
            </>
          )}
        </nav>
      </div>
      <div className="od-topbar-right">
        {status}
        {right}
      </div>
    </div>
  );
}
