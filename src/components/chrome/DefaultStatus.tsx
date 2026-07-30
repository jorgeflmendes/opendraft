import { StatusBar } from "./StatusBar";

interface DefaultStatusProps {
  file?: string;
  cursor?: string;
  engine?: string;
  time?: string;
}

export function DefaultStatus({
  file = "main.tex",
  cursor = "Ln 1, Col 1",
  engine = "XeLaTeX / WASM",
  time = "1.24s",
}: DefaultStatusProps) {
  return (
    <StatusBar
      items={[
        <span className="od-mono" key="f">
          {file} / {cursor}
        </span>,
        <span key="e">{engine}</span>,
        <span key="l" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--od-ok)",
              display: "inline-block",
            }}
          />
          <b>Local</b> / {time === "-" ? "Not compiled" : time}
        </span>,
      ]}
    />
  );
}
