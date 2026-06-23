export type LayoutTopBannerSeverity = "critical" | "warning";

export interface LayoutTopBannerItem {
  id: string;
  message: string;
  title?: string;
  description?: string;
  severity: LayoutTopBannerSeverity;
  canCollapse: boolean;
  secondaryActionLabel?: string;
  secondaryActionDisabled?: boolean;
  onSecondaryAction?: () => void;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  onPrimaryAction?: () => void;
}
