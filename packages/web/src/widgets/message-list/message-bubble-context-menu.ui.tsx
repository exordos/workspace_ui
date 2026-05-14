import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
  type MessageContextMenuSide,
} from "./message-bubble-context-menu-position.lib";
import { CONTEXT_ITEMS_BY_LABEL } from "./message-bubble-context.lib";
import { QUICK_REACTIONS, resolveEmojiShortcodeDisplayGlyph } from "./message-bubble-emoji.lib";
import type { MessageBubbleContextMenuProps } from "./message-bubble-context-menu.types";

const CONTENT_CLASS_NAME =
  "z-dropdown min-w-context-menu-message rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg";

const MENU_TRIGGER_CLASS_NAME =
  "hover:bg-bg/50 absolute -top-2 z-float rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary";

const CONTEXT_ANCHOR_TRIGGER_STYLE: React.CSSProperties = {
  position: "fixed",
  width: 0,
  height: 0,
  margin: 0,
  padding: 0,
  border: 0,
  opacity: 0,
  pointerEvents: "none",
};

// Для открытия влево Radix ждёт "триггер справа от меню", поэтому смещаем виртуальный trigger.
function resolveContextTriggerLeft(anchorLeft: number, side: MessageContextMenuSide): number {
  return side === "right" ? anchorLeft : anchorLeft + MESSAGE_CONTEXT_MENU_EST_WIDTH_PX;
}

const MessageBubbleContextMenuContent = React.memo(function MessageBubbleContextMenuContent({
  emojiPickerOpen,
  onEmojiPickerOpenChange,
  visibleContextSections,
  onMenuItem,
  onQuickReaction,
  onEmojiPick,
  customEmojis,
}: Omit<
  MessageBubbleContextMenuProps,
  "open" | "source" | "contextAnchor" | "onOpenChange" | "isOwn" | "onSourceChange"
>) {
  return (
    <>
      <div className="flex items-center gap-0.5 border-b border-border-subtle px-3 py-2">
        {QUICK_REACTIONS.map((reaction) => (
          <button
            key={reaction.emojiName}
            type="button"
            className="hover:bg-bg/50 flex h-6 w-6 items-center justify-center rounded p-1 text-current"
            aria-label={t(reaction.a11yLabelKey)}
            onClick={(e) => {
              e.preventDefault();
              onQuickReaction(reaction.emojiName);
            }}
          >
            <span className="text-[15px] leading-none">
              {resolveEmojiShortcodeDisplayGlyph(reaction.emojiName)}
            </span>
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            className="hover:bg-bg/50 flex h-6 w-6 items-center justify-center rounded p-1 text-text-muted hover:text-text-primary"
            aria-label={t("a11y.moreReactions")}
            onClick={(e) => {
              e.preventDefault();
              onEmojiPickerOpenChange(!emojiPickerOpen);
            }}
          >
            <Icon name="plus" size={14} className="text-current" />
          </button>
          {emojiPickerOpen && (
            <>
              <div
                className="fixed inset-0 z-overlay"
                aria-hidden
                onClick={() => onEmojiPickerOpenChange(false)}
              />
              <div className="absolute left-0 top-full z-dropdown mt-1 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
                <EmojiPicker
                  onEmojiClick={onEmojiPick}
                  customEmojis={customEmojis}
                  emojiStyle={EmojiStyle.NATIVE}
                  theme={
                    document.documentElement.dataset.theme === "light" ? Theme.LIGHT : Theme.DARK
                  }
                  width={320}
                  height={360}
                  searchDisabled={false}
                  previewConfig={{ showPreview: false }}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {visibleContextSections.map((section, sectionIndex) => (
        <React.Fragment key={`context-section-${sectionIndex}`}>
          {sectionIndex > 0 && (
            <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border-subtle" />
          )}
          {section.map((label) => (
            <DropdownMenu.Item
              key={label}
              className="hover:bg-bg/80 data-[highlighted]:bg-accent/20 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none"
              onSelect={(e) => {
                e.preventDefault();
                onMenuItem(label);
              }}
            >
              <Icon
                name={CONTEXT_ITEMS_BY_LABEL[label].iconName}
                size={14}
                className="text-current opacity-70"
              />
              {t(`message.${label}`)}
            </DropdownMenu.Item>
          ))}
        </React.Fragment>
      ))}
    </>
  );
});

export const MessageBubbleContextMenu = React.memo(function MessageBubbleContextMenu({
  open,
  source,
  contextAnchor,
  onSourceChange,
  onOpenChange,
  isOwn,
  emojiPickerOpen,
  onEmojiPickerOpenChange,
  visibleContextSections,
  onMenuItem,
  onQuickReaction,
  onEmojiPick,
  customEmojis,
}: MessageBubbleContextMenuProps) {
  // Держим два независимых режима:
  // - trigger: обычное открытие по троеточию;
  // - context: открытие по ПКМ в позиции курсора.
  const isTriggerMenuOpen = open && source === "trigger";
  const isContextMenuOpen = open && source === "context" && contextAnchor != null;

  return (
    <>
      <DropdownMenu.Root
        open={isTriggerMenuOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onSourceChange("trigger");
          }
          onOpenChange(nextOpen);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            data-context-menu-trigger-source="trigger"
            className={`${MENU_TRIGGER_CLASS_NAME} ${isOwn ? "-left-8" : "-right-8"}`}
            aria-label={t("a11y.messageMenu")}
            onPointerDown={() => {
              onSourceChange("trigger");
            }}
          >
            <Icon name="more" size={16} className="text-current" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={CONTENT_CLASS_NAME}
            sideOffset={4}
            align={isOwn ? "end" : "start"}
          >
            <MessageBubbleContextMenuContent
              emojiPickerOpen={emojiPickerOpen}
              onEmojiPickerOpenChange={onEmojiPickerOpenChange}
              visibleContextSections={visibleContextSections}
              onMenuItem={onMenuItem}
              onQuickReaction={onQuickReaction}
              onEmojiPick={onEmojiPick}
              customEmojis={customEmojis}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {contextAnchor != null && (
        <DropdownMenu.Root
          open={isContextMenuOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              onSourceChange("context");
            }
            onOpenChange(nextOpen);
          }}
        >
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              data-context-menu-trigger-source="context"
              // Невидимый fixed-trigger: нужен только как якорь для позиционирования Radix.
              style={{
                ...CONTEXT_ANCHOR_TRIGGER_STYLE,
                left: resolveContextTriggerLeft(contextAnchor.left, contextAnchor.side),
                top: contextAnchor.top,
              }}
            />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={CONTENT_CLASS_NAME}
              side={contextAnchor.side}
              align="start"
              sideOffset={0}
              onCloseAutoFocus={(event) => {
                // Не уводим фокус на скрытый trigger после закрытия меню.
                event.preventDefault();
              }}
            >
              <MessageBubbleContextMenuContent
                emojiPickerOpen={emojiPickerOpen}
                onEmojiPickerOpenChange={onEmojiPickerOpenChange}
                visibleContextSections={visibleContextSections}
                onMenuItem={onMenuItem}
                onQuickReaction={onQuickReaction}
                onEmojiPick={onEmojiPick}
                customEmojis={customEmojis}
              />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </>
  );
});
