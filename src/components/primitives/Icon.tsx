import type { CSSProperties, SVGAttributes } from "react";

// Omit native `d` because this renderer also accepts multi-path icon data.
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "size" | "d"> {
  d: string | string[];
  size?: number;
  sw?: number;
  fill?: string;
  style?: CSSProperties;
}

export function Icon({ d, size = 14, sw = 1.6, fill = "none", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      {...rest}
    >
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}
