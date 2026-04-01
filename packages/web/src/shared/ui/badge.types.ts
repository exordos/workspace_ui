export type BadgeVariant = "muted" | "unread";

export interface BadgeProps {
  count: number;
  variant?: BadgeVariant;
  /** For large numbers (e.g. 458) — slightly rounded rectangle instead of a pill */
  rounded?: "full" | "md";
  className?: string;
}
