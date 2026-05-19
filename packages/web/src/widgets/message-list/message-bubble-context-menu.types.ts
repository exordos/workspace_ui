import type { RealmEmoji } from "~/shared/api/zulip.types";
import type { ContextItemLabel } from "./message-bubble-context.lib";
import type { EmojiClickData } from "emoji-picker-react";

// Откуда открыли меню:
// - trigger: по троеточию;
// - context: по ПКМ рядом с курсором.
export type MessageBubbleContextMenuSource = "trigger" | "context";

// Позиция якоря для режима context (ПКМ).
export interface MessageBubbleContextMenuAnchor {
  left: number;
  top: number;
}

// Полный набор пропсов для контекстного меню сообщения.
export interface MessageBubbleContextMenuProps {
  // Общее состояние открытия меню.
  open: boolean;
  // Текущий режим открытия (троеточие или ПКМ).
  source: MessageBubbleContextMenuSource;
  // Координаты для режима ПКМ; для троеточия обычно null.
  contextAnchor: MessageBubbleContextMenuAnchor | null;
  // Смена режима открытия меню.
  onSourceChange: (source: MessageBubbleContextMenuSource) => void;
  // Единый обработчик открытия/закрытия.
  onOpenChange: (open: boolean) => void;
  // Нужен для выравнивания меню у своих/чужих сообщений в trigger-режиме.
  isOwn: boolean;
  // Состояние встроенного emoji-picker.
  emojiPickerOpen: boolean;
  onEmojiPickerOpenChange: (open: boolean) => void;
  // Группы пунктов меню в нужном порядке.
  visibleContextSections: readonly (readonly ContextItemLabel[])[];
  // Клик по пункту меню.
  onMenuItem: (label: ContextItemLabel) => void;
  // Быстрые реакции из верхней панели.
  onQuickReaction: (emojiName: string) => void;
  // Выбор emoji из полного picker.
  onEmojiPick: (data: EmojiClickData) => void;
  // Кастомные emoji текущего realm.
  customEmojis?: RealmEmoji[];
}
