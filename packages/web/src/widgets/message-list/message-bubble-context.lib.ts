import type { IconName } from "~/shared/ui/icon";
import type { MessageBubbleCallbacks } from "./message-bubble.types";

export const CONTEXT_ITEMS_BY_LABEL = {
  joinCall: { iconName: "phone" },
  copyCallLink: { iconName: "copy" },
  reply: { iconName: "reply" },
  forward: { iconName: "forward" },
  openInChat: { iconName: "chatBubble" },
  copy: { iconName: "copy" },
  views: { iconName: "visibility" },
  star: { iconName: "star" },
  select: { iconName: "check" },
  edit: { iconName: "pen" },
  delete: { iconName: "delete" },
} as const satisfies Record<string, { iconName: IconName }>;

export type ContextItemLabel = keyof typeof CONTEXT_ITEMS_BY_LABEL;

export const BASE_CONTEXT_SECTIONS = [
  ["reply", "forward", "openInChat"],
  ["copy", "views"],
  ["star", "select"],
  ["edit", "delete"],
] as const satisfies readonly (readonly ContextItemLabel[])[];

export const JITSI_CONTEXT_SECTIONS = [
  ["joinCall", "copyCallLink"],
  ["reply", "forward", "openInChat"],
  ["copy", "views"],
  ["star", "select"],
  ["edit", "delete"],
] as const satisfies readonly (readonly ContextItemLabel[])[];

export const LABEL_TO_ACTION = {
  views: "onViews",
  reply: "onReply",
  edit: "onEdit",
  copy: "onCopy",
  forward: "onForward",
  star: "onStar",
  delete: "onDelete",
  select: "onSelect",
  openInChat: "onOpenInChat",
} as const satisfies Partial<Record<ContextItemLabel, keyof MessageBubbleCallbacks>>;
