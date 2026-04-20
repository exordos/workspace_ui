import type { SidebarChat } from "./sidebar.types";
import type { KeyboardEventHandler, MouseEventHandler } from "react";

export interface DmChatRowProps {
  chat: Extract<SidebarChat, { type: "dm" }>;
  isActive: boolean;
  isPinned: boolean;
  compact: boolean;
  onContextMenu?: MouseEventHandler;
  onKeyDown?: KeyboardEventHandler;
}
