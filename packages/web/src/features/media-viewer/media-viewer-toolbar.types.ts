export interface MediaViewerToolbarProps {
  actionsEnabled: boolean;
  downloadEnabled?: boolean;
  showCopy: boolean;
  copyKey: string;
  showOpenInNewTab: boolean;
  onOpenInNewTab: () => void;
  onDownload: () => void;
  onCopy: () => Promise<boolean>;
  onClose: () => void;
}
