"use client";

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
};

/**
 * v2 segmented control — spec §5.3. Recessed near-black track with a
 * gold-tinted active pill. Used for the Stats sort toggle (Points / Avg /
 * Wins / Best) and any metric toggle inside cards.
 *
 * Generic over the option value type so callers get string-literal narrowing
 * back through `onChange`.
 */
export function V2SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: Props<T>) {
  return (
    <div className={`v2-seg-track ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`v2-seg ${value === opt.value ? "v2-seg-on" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
