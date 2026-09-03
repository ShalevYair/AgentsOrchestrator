import * as React from "react";
import { Input } from "./input.js";

export interface NumericFieldProps {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
  onFocus?: () => void;
  disabled?: boolean;
}

/**
 * A positive-integer input that stays a plain controlled `<input>` from
 * React's point of view, but keeps its OWN draft string while the user is
 * typing — a bare `value={n} onChange={...}` number field can't represent
 * "the box is momentarily empty because the user just selected all and is
 * about to type a replacement" without either rejecting the keystroke or
 * lying about what's on screen. `onCommit` only fires once the draft is a
 * valid positive integer; an invalid draft reverts to `value` on blur.
 * Shared by the goal button (P9-T1) and plan editing (P9-T3) — both need
 * exactly this behavior for their numeric inputs.
 */
export function NumericField({
  value,
  onCommit,
  min,
  step,
  className,
  onFocus,
  disabled,
  ...rest
}: NumericFieldProps): React.JSX.Element {
  const [draft, setDraft] = React.useState(String(value));
  const isFocused = React.useRef(false);

  // Follows external changes to `value` (e.g. picking a different level)
  // — but never while the field itself has focus, so it can't clobber a
  // keystroke that hasn't committed yet.
  React.useEffect(() => {
    if (!isFocused.current) setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={min}
      step={step}
      value={draft}
      className={className}
      disabled={disabled}
      aria-label={rest["aria-label"]}
      onFocus={() => {
        isFocused.current = true;
        onFocus?.();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = Number.parseInt(e.target.value, 10);
        if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
      }}
      onBlur={() => {
        isFocused.current = false;
        setDraft(String(value));
      }}
    />
  );
}
