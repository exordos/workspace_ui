import type { KeyboardEventHandler, MouseEventHandler } from "react";
import type { SidebarChat } from "./sidebar.types";

export interface DmChatRowProps {
  chat: Extract<SidebarChat, { type: "dm" }>;
  isActive: boolean;
  isPinned: boolean;
  compact: boolean;
  onContextMenu?: MouseEventHandler;
  onKeyDown?: KeyboardEventHandler;
}
