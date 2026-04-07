export interface ChatPageDeleteConfirmBarProps {
  mode: "single" | "bulk";
  bulkCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}
