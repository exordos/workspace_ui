import type { DatePickerProps } from "~/shared/ui/date-picker";
import type { TimePickerProps } from "~/shared/ui/time-picker";
import type { AriaAttributes } from "react";

export interface DateTimePickerProps extends AriaAttributes {
  /** Controlled selection in the browser's local time zone. */
  value: Date | null;
  /** Emits a new Date at the active precision, without mutating the supplied value. */
  onValueChange: (value: Date) => void;
  defaultMonth?: Date;
  /** Inclusive local date/time bounds. */
  min?: Date;
  max?: Date;
  disabled?: boolean;
  showSeconds?: boolean;
  /** Shows the TimePicker step buttons; wheel and keyboard controls stay available. */
  showArrows?: boolean;
  datePickerProps?: Omit<
    DatePickerProps,
    "value" | "onValueChange" | "min" | "max" | "disabled" | "defaultMonth"
  >;
  timePickerProps?: Omit<
    TimePickerProps,
    | "value"
    | "onValueChange"
    | "min"
    | "max"
    | "disabled"
    | "isTimeDisabled"
    | "showSeconds"
    | "showArrows"
  >;
  className?: string;
}
