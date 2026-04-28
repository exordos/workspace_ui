import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { CONTEXT_ITEMS_BY_LABEL } from "./message-bubble-context.lib";
import { QUICK_REACTIONS, resolveEmojiShortcodeDisplayGlyph } from "./message-bubble-emoji.lib";
import type { MessageBubbleContextMenuProps } from "./message-bubble-context-menu.types";

export const MessageBubbleContextMenu = React.memo(function MessageBubbleContextMenu({
  open,
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
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`hover:bg-bg/50 absolute -top-2 z-float rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary ${isOwn ? "-left-8" : "-right-8"}`}
          aria-label={t("a11y.messageMenu")}
        >
          <Icon name="more" size={16} className="text-current" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-context-menu-message rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align={isOwn ? "end" : "start"}
        >
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});
