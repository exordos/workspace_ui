import type { AriaAttributes } from "react";

export interface DatePickerProps extends AriaAttributes {
  /** Controlled selection, interpreted in the browser's local time zone. */
  value: Date | null;
  /** Emits a new local Date at midnight. Never mutates the supplied value. */
  onValueChange: (value: Date) => void;
  /** Initial calendar month when value is empty. Defaults to today within min/max. */
  defaultMonth?: Date;
  /** Inclusive local calendar dates; time-of-day is ignored. */
  min?: Date;
  max?: Date;
  disabled?: boolean;
  className?: string;
}
