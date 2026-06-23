export type LayoutTopBannerSeverity = "critical" | "warning";

export interface LayoutTopBannerItem {
  id: string;
  message: string;
  severity: LayoutTopBannerSeverity;
  canCollapse: boolean;
  canDismiss: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onDismiss?: () => void;
}
