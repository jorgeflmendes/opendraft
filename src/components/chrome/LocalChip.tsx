interface LocalChipProps {
  ms?: string;
  label?: string;
}

export function LocalChip({ ms = "1.24s", label = "Compiled locally" }: LocalChipProps) {
  return (
    <span className="od-local">
      <span className="pulse" aria-hidden="true" />
      <span>
        <b>{label}</b> / {ms}
      </span>
    </span>
  );
}
