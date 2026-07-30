import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "ok" | "coral" | "err" | "warn" | "info";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Render a coloured leading dot. */
  dot?: boolean;
  leadingIcon?: ReactNode;
}

const toneClass: Record<Tone, string> = {
  neutral: "",
  ok: "od-pill--ok",
  coral: "od-pill--coral",
  err: "od-pill--err",
  warn: "od-pill--warn",
  info: "od-pill--info",
};

export function Pill({
  tone = "neutral",
  dot = false,
  leadingIcon,
  className,
  children,
  ...rest
}: PillProps) {
  const cls = ["od-pill", toneClass[tone], className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot && <span className="dot" />}
      {leadingIcon}
      {children}
    </span>
  );
}
