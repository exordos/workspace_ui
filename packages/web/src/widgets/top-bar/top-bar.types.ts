import type { ReactNode } from "react";

export type TopBarSection = "chat" | "calendar" | "mail" | "calls" | "services";

export interface TopBarProps {
  activeSection: TopBarSection;
  onSectionChange: (section: TopBarSection) => void;
  onOpenSearch?: () => void;
  /** Open the current user's profile drawer */
  onOpenProfile?: () => void;
  /** Left content (e.g. the instance switcher) */
  leftContent?: ReactNode;
}
