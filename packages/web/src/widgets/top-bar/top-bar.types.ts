import type { DownloadEntry } from "~/entities/download/download.types";

export type TopBarSection = "chat" | "calendar" | "mail" | "calls" | "services";

export interface TopBarSectionNavItem {
  id: TopBarSection;
  icon: "chatBubble" | "calendar" | "mail" | "phone" | "grid";
  label: string;
  available: boolean;
}

export interface TopBarSectionButtonProps {
  id: TopBarSection;
  icon: TopBarSectionNavItem["icon"];
  label: string;
  available: boolean;
  isActive: boolean;
  onSelect: (id: TopBarSection) => void;
}

export interface TopBarSectionNavProps {
  sections: TopBarSectionNavItem[];
  activeSection: TopBarSection;
  onSectionChange: (section: TopBarSection) => void;
  /** Merged onto the root slot (e.g. `electron-no-drag` on macOS). */
  className?: string;
}

export interface TopBarSearchButtonProps {
  onOpenSearch: () => void;
}

export interface TopBarDownloadRowProps {
  entry: DownloadEntry;
  statusLabel: string;
  nativeActionsAvailable: boolean;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}
