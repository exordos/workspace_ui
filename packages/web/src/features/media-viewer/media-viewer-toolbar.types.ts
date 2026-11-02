export interface MediaViewerToolbarProps {
  actionsEnabled: boolean;
  showCopy: boolean;
  copyKey: string;
  showOpenInNewTab: boolean;
  onOpenInNewTab: () => void;
  onDownload: () => void;
  onCopy: () => Promise<boolean>;
  onClose: () => void;
}
