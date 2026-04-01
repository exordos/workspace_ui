export interface ChatPageSelectionBarProps {
  selectedCount: number;
  forwardDisabled: boolean;
  deleteDisabled: boolean;
  onForward: () => void;
  onDelete: () => void;
  onCancel: () => void;
}
