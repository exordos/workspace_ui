export interface MediaViewerToolbarProps {
  actionsEnabled: boolean;
  showOpenInNewTab: boolean;
  onOpenInNewTab: () => void;
  onDownload: () => void;
  onClose: () => void;
}
