import type { WorkspaceFolderRailSystemType } from "~/shared/api/workspace-client";

export interface FolderRailFolder {
  id: string;
  label: string;
  backgroundColor: number;
  badge?: number;
  systemType?: WorkspaceFolderRailSystemType;
}

export type FolderRailLayout = "vertical" | "horizontal";

export interface FolderRailProps {
  folders: FolderRailFolder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onOrderPinning?: (id: string) => void;
  onToggleLayout?: () => void;
  onFoldersChanged?: () => void;
  layout?: FolderRailLayout;
}
