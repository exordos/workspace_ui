import type { CSSProperties } from "react";

export interface ScheduleMenuOption {
  id: string;
  label: string;
  resolveSendAt: (nowMs: number) => number;
}

export interface MessageComposerSchedulePopoverProps {
  scheduleMenuStyle: CSSProperties;
  options: ScheduleMenuOption[];
  onPick: (sendAt: number) => void;
  onCloseBackdrop: () => void;
}
