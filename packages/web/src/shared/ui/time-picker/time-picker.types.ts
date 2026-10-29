import type { AriaAttributes } from "react";

export interface TimePickerProps extends AriaAttributes {
  /** Controlled 24-hour time (HH:mm or HH:mm:ss), or null for no selection. No date or time zone. */
  value: string | null;
  onValueChange: (value: string) => void;
  showSeconds?: boolean;
  /** Shows step buttons; wheel and keyboard controls work without them. */
  showArrows?: boolean;
  /** Inclusive bounds within the same day, at the active precision. */
  min?: string;
  max?: string;
  /** Optional caller-owned exclusions, for example nonexistent local times on a date. */
  isTimeDisabled?: (value: string) => boolean;
  disabled?: boolean;
  className?: string;
}
