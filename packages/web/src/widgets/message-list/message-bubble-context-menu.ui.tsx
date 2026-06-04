/**
 * Renders the message bubble context menu and reaction picker controls.
 * Keeps message actions, quick reactions, and the emoji picker wired to menu state.
 */
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import React from "react";
import { createPortal } from "react-dom";
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
const REACTION_EMOJI_PICKER_WIDTH = 320;
const REACTION_EMOJI_PICKER_HEIGHT = 360;
const REACTION_EMOJI_PICKER_MARGIN = 8;
const REACTION_EMOJI_PICKER_GAP = 8;

interface MessageReactionEmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiPick: MessageBubbleContextMenuProps["onEmojiPick"];
  customEmojis: MessageBubbleContextMenuProps["customEmojis"];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function getReactionEmojiPickerStyle(anchor: HTMLElement | null): React.CSSProperties {
  if (typeof window === "undefined") return {};
  const anchorRect = anchor?.getBoundingClientRect();
  const availableWidth = Math.max(0, window.innerWidth - REACTION_EMOJI_PICKER_MARGIN * 2);
  const availableHeight = Math.max(0, window.innerHeight - REACTION_EMOJI_PICKER_MARGIN * 2);
  const width = Math.min(REACTION_EMOJI_PICKER_WIDTH, availableWidth);
  const height = Math.min(REACTION_EMOJI_PICKER_HEIGHT, availableHeight);
  const maxLeft = Math.max(
    REACTION_EMOJI_PICKER_MARGIN,
    window.innerWidth - width - REACTION_EMOJI_PICKER_MARGIN,
  );
  const maxTop = Math.max(
    REACTION_EMOJI_PICKER_MARGIN,
    window.innerHeight - height - REACTION_EMOJI_PICKER_MARGIN,
  );
  const fallbackTop = maxTop;
  if (anchorRect == null) {
    return {
      left: REACTION_EMOJI_PICKER_MARGIN,
      top: clamp(fallbackTop, REACTION_EMOJI_PICKER_MARGIN, maxTop),
      width,
      height,
    };
  }

  const rightLeft = anchorRect.right + REACTION_EMOJI_PICKER_GAP;
  const leftLeft = anchorRect.left - width - REACTION_EMOJI_PICKER_GAP;
  let left = rightLeft;
  if (rightLeft + width <= window.innerWidth - REACTION_EMOJI_PICKER_MARGIN) {
    left = rightLeft;
  } else if (leftLeft >= REACTION_EMOJI_PICKER_MARGIN) {
    left = leftLeft;
  }

  return {
    left: clamp(left, REACTION_EMOJI_PICKER_MARGIN, maxLeft),
    top: clamp(anchorRect.top, REACTION_EMOJI_PICKER_MARGIN, maxTop),
    width,
    height,
  };
}

const MessageReactionEmojiPicker = React.memo(function MessageReactionEmojiPicker({
  open,
  onOpenChange,
  onEmojiPick,
  customEmojis,
}: MessageReactionEmojiPickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [pickerStyle, setPickerStyle] = React.useState<React.CSSProperties>({});

  const updatePickerPosition = React.useCallback(() => {
    setPickerStyle(getReactionEmojiPickerStyle(triggerRef.current));
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePickerPosition();
    const handleWindowChange = () => updatePickerPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, updatePickerPosition]);

  const theme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
      ? Theme.LIGHT
      : Theme.DARK;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={`${REACTION_BUTTON_CLASS_NAME} text-text-muted hover:text-text-primary`}
        aria-label={t("a11y.moreReactions")}
        onClick={createEmojiPickerToggleHandler(open, onOpenChange)}
      >
        <Icon name="plus" size={14} className="text-current" />
      </button>
      {open &&
        createPortal(
          <>
            <div
              data-testid="message-reaction-emoji-picker-backdrop"
              className="pointer-events-auto fixed inset-0 z-overlay"
              aria-hidden
              onClick={() => onOpenChange(false)}
            />
            <div
              data-testid="message-reaction-emoji-picker-popover"
              className="pointer-events-auto fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
              style={pickerStyle}
            >
              <EmojiPicker
                onEmojiClick={onEmojiPick}
                customEmojis={customEmojis}
                emojiStyle={EmojiStyle.NATIVE}
                theme={theme}
                width="100%"
                height="100%"
                searchDisabled={false}
                previewConfig={{ showPreview: false }}
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
});

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
            <MessageReactionEmojiPicker
              open={emojiPickerOpen}
              onOpenChange={onEmojiPickerOpenChange}
              onEmojiPick={onEmojiPick}
              customEmojis={customEmojis}
            />
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
      modal={false}
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
