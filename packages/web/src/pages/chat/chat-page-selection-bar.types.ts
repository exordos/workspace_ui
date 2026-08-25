export interface ChatPageSelectionBarProps {
  selectedCount: number;
  replyDisabled: boolean;
  forwardDisabled: boolean;
  deleteDisabled: boolean;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onCancel: () => void;
  joinedAbove?: boolean;
  joinedBelow?: boolean;
  omitBottomBorder?: boolean;
}
