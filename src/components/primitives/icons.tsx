import { Icon, type IconProps } from "./Icon";

// Canonical line-icon registry. Keeping path data centralized preserves a
// consistent stroke language and gives consumers named components.

type P = Omit<IconProps, "d">;

const make =
  (d: string | string[], defaults: Partial<IconProps> = {}) =>
  (props: P) => <Icon {...defaults} {...props} d={d} />;

export const I = {
  // File / folder / chevron / dots
  folder: make(
    "M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z",
  ),
  folderOpen: make([
    "M3 8h18l-2.2 9.4A2 2 0 0 1 16.85 19H5.4a2 2 0 0 1-1.95-1.56L3 8Z",
    "M5 8V6.5A1.5 1.5 0 0 1 6.5 5h3l2 2H19",
  ]),
  file: make(["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z", "M14 3v5h5"]),
  tex: make([
    "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z",
    "M14 3v5h5",
    "M8 14h2m0 0v3m0-3l3 3M8 17l3-3",
  ]),
  bib: make([
    "M5 4.5A1.5 1.5 0 0 1 6.5 3H17a2 2 0 0 1 2 2v14a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 19h11",
    "M5 4.5V19",
    "M9 7h6M9 11h6",
  ]),
  img: make([
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    "M3 16l5-5 4 4 3-3 6 6",
    "M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  ]),
  chevronR: make("M9 6l6 6-6 6", { sw: 1.7 }),
  chevronD: make("M6 9l6 6 6-6", { sw: 1.7 }),
  dots: make(["M5 12h.01", "M12 12h.01", "M19 12h.01"], { sw: 2.4 }),

  // Chrome
  search: make(["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-3.5-3.5"]),
  play: make("M6 4l14 8-14 8V4Z", { fill: "currentColor", sw: 0 }),
  zap: make("M13 2L4 14h7l-1 8 9-12h-7l1-8Z"),
  cpu: make([
    "M9 9h6v6H9z",
    "M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Z",
    "M3 10h2M3 14h2M19 10h2M19 14h2M10 3v2M14 3v2M10 19v2M14 19v2",
  ]),
  lock: make(["M6 10h12v10H6z", "M8 10V7a4 4 0 1 1 8 0v3"]),
  cloudOff: make([
    "M3 3l18 18",
    "M18.4 14.5A4 4 0 0 0 17 7h-1.26A8 8 0 0 0 4 11.2",
    "M7.4 7.4A8 8 0 0 0 9 15a4 4 0 0 0 4 4h4.4",
  ]),
  arrowR: make("M5 12h14M13 6l6 6-6 6"),
  arrowL: make("M19 12H5M11 6l-6 6 6 6"),
  plus: make(["M12 5v14", "M5 12h14"]),
  x: make(["M6 6l12 12", "M18 6L6 18"]),
  alert: make([
    "M12 9v4",
    "M12 17v.01",
    "M10.3 3.86l-8.16 14.14A2 2 0 0 0 3.87 21h16.26a2 2 0 0 0 1.73-3L13.7 3.86a2 2 0 0 0-3.4 0Z",
  ]),
  download: make(["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"]),
  upload: make(["M12 15V3", "M7 8l5-5 5 5", "M5 21h14"]),
  refresh: make([
    "M3 12a9 9 0 0 1 15-6.7L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-15 6.7L3 16",
    "M3 21v-5h5",
  ]),
  zoomIn: make(["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-3.5-3.5", "M11 8v6M8 11h6"]),
  zoomOut: make(["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-3.5-3.5", "M8 11h6"]),
  diff: make(["M12 3v12", "M6 9l6-6 6 6", "M6 21h12"]),
  externalLink: make([
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    "M15 3h6v6",
    "M10 14L21 3",
  ]),
  fitWidth: make(["M21 12H3", "M18 9l3 3-3 3", "M6 9l-3 3 3 3"]),
  fitPage: make(["M12 21V3", "M9 18l3 3 3-3", "M9 6l3-3 3 3"]),
  sidebar: make(["M4 4h16v16H4z", "M9 4v16"]),
  sun: make([
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41",
  ]),
  moon: make("M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"),
  trash: make([
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    "M10 11v6",
    "M14 11v6",
  ]),
  restore: make(["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"]),
} as const;
