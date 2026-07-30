import type { ButtonHTMLAttributes, ReactNode } from "react";

// Variant + size stay as string unions so valid combinations remain
// explicit and discoverable in IDE autocomplete.

type Variant = "default" | "ghost" | "primary" | "soft";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  default: "",
  ghost: "od-btn--ghost",
  primary: "od-btn--primary",
  soft: "od-btn--soft",
};

const sizeClass: Record<Size, string> = {
  sm: "od-btn--sm",
  md: "",
  lg: "od-btn--lg",
};

export function Button({
  variant = "default",
  size = "md",
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["od-btn", variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
