export type BadgeVariant = "muted" | "unread";
export type BadgeSize = "default" | "sm";
export type BadgeTextTone = "default" | "primary";

export interface BadgeProps {
  count: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Override variant text color — `primary` matches sidebar hover label tone. */
  textTone?: BadgeTextTone;
  /** For large numbers (e.g. 458) — slightly rounded rectangle instead of a pill */
  rounded?: "full" | "md";
  className?: string;
}
