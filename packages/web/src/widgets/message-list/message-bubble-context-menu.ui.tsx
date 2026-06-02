import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import React from "react";
import { t } from "~/i18n/i18n";
import {
  DropdownMenu,
  type DropdownMenuContentProps,
  type DropdownMenuItem,
} from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import {
  createContextMenuItemSelectHandler,
  createEmojiPickerToggleHandler,
  createQuickReactionClickHandler,
} from "./message-bubble-context-menu-items.lib";
import { CONTEXT_ITEMS_BY_LABEL } from "./message-bubble-context.lib";
import { QUICK_REACTIONS, resolveEmojiShortcodeDisplayGlyph } from "./message-bubble-emoji.lib";
import type { MessageBubbleContextMenuProps } from "./message-bubble-context-menu.types";

const MENU_TRIGGER_CLASS_NAME =
  "hover:bg-bg/50 absolute -top-2 z-float rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary";
const MENU_ITEM_CLASS_NAME =
  "data-[highlighted]:bg-sidebar-hover hover:bg-sidebar-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none transition-colors";
const REACTION_BUTTON_CLASS_NAME =
  "hover:bg-sidebar-hover flex h-6 w-6 items-center justify-center rounded p-1 transition-colors";

function useMessageMenuItems({
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
>): readonly DropdownMenuItem[] {
  return React.useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [
      {
        type: "custom",
        key: "quick-reactions",
        render: () => (
          <div className="flex items-center gap-0.5 border-b border-border-subtle px-3 py-2">
            {QUICK_REACTIONS.map((reaction) => (
              <button
                key={reaction.emojiName}
                type="button"
                className={`${REACTION_BUTTON_CLASS_NAME} text-current`}
                aria-label={t(reaction.a11yLabelKey)}
                onClick={createQuickReactionClickHandler(onQuickReaction, reaction.emojiName)}
              >
                <span className="text-[15px] leading-none">
                  {resolveEmojiShortcodeDisplayGlyph(reaction.emojiName)}
                </span>
              </button>
            ))}
            <div className="relative">
              <button
                type="button"
                className={`${REACTION_BUTTON_CLASS_NAME} text-text-muted hover:text-text-primary`}
                aria-label={t("a11y.moreReactions")}
                onClick={createEmojiPickerToggleHandler(emojiPickerOpen, onEmojiPickerOpenChange)}
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
                        document.documentElement.dataset.theme === "light"
                          ? Theme.LIGHT
                          : Theme.DARK
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
        ),
      },
    ];

    visibleContextSections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        items.push({ type: "separator", key: `context-separator-${sectionIndex}` });
      }
      section.forEach((label) => {
        items.push({
          type: "action",
          key: label,
          icon: CONTEXT_ITEMS_BY_LABEL[label].iconName,
          label: t(`message.${label}`),
          keepOpenOnSelect: true,
          onSelect: createContextMenuItemSelectHandler(onMenuItem, label),
        });
      });
    });
    return items;
  }, [
    customEmojis,
    emojiPickerOpen,
    onEmojiPick,
    onEmojiPickerOpenChange,
    onMenuItem,
    onQuickReaction,
    visibleContextSections,
  ]);
}

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
  const menuItems = useMessageMenuItems({
    emojiPickerOpen,
    onEmojiPickerOpenChange,
    visibleContextSections,
    onMenuItem,
    onQuickReaction,
    onEmojiPick,
    customEmojis,
  });
  const triggerContentProps = React.useMemo<DropdownMenuContentProps>(
    () => ({
      sideOffset: 4,
      align: isOwn ? "end" : "start",
    }),
    [isOwn],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      source={source}
      onSourceChange={onSourceChange}
      contextAnchor={contextAnchor}
      trigger={
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
      }
      items={menuItems}
      contentVariant="message"
      itemClassName={MENU_ITEM_CLASS_NAME}
      submenuTriggerClassName={MENU_ITEM_CLASS_NAME}
      checkboxItemClassName={MENU_ITEM_CLASS_NAME}
      triggerContentProps={triggerContentProps}
      contextContentProps={{
        sideOffset: 0,
        align: "start",
        onCloseAutoFocus: (event) => {
          event.preventDefault();
        },
      }}
    />
  );
});
