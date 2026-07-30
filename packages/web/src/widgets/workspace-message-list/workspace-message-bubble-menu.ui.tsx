import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "~/i18n/i18n";
import {
  DropdownMenu,
  type DropdownMenuContentProps,
  type DropdownMenuItem,
} from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import type {
  WorkspaceMessageBubbleMenuProps,
  WorkspaceReactionEmojiPickerProps,
} from "./workspace-message-bubble-menu.types";

const MENU_TRIGGER_CLASS_NAME =
  "hover:bg-sidebar-hover absolute -top-2 z-float rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary";
const MENU_ITEM_CLASS_NAME =
  "data-[highlighted]:bg-sidebar-hover hover:bg-sidebar-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none transition-colors";
const REACTION_BUTTON_CLASS_NAME =
  "hover:bg-sidebar-hover flex h-7 w-7 items-center justify-center rounded p-1 transition-colors";
const REACTION_EMOJI_PICKER_WIDTH = 320;
const REACTION_EMOJI_PICKER_HEIGHT = 360;
const REACTION_EMOJI_PICKER_MARGIN = 8;
const REACTION_EMOJI_PICKER_GAP = 8;

const QUICK_REACTIONS = [
  { emojiName: "heart", labelKey: "a11y.like", glyph: "❤️" },
  { emojiName: "thumbs_up", labelKey: "a11y.thumbsUp", glyph: "👍" },
  { emojiName: "joy", labelKey: "a11y.joy", glyph: "😂" },
  { emojiName: "open_mouth", labelKey: "a11y.surprised", glyph: "😮" },
  { emojiName: "cry", labelKey: "a11y.crying", glyph: "😢" },
  { emojiName: "clap", labelKey: "a11y.clap", glyph: "👏" },
] as const;

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
  if (anchorRect == null) {
    return {
      left: REACTION_EMOJI_PICKER_MARGIN,
      top: clamp(maxTop, REACTION_EMOJI_PICKER_MARGIN, maxTop),
      width,
      height,
    };
  }

  const rightLeft = anchorRect.right + REACTION_EMOJI_PICKER_GAP;
  const leftLeft = anchorRect.left - width - REACTION_EMOJI_PICKER_GAP;
  const left =
    rightLeft + width <= window.innerWidth - REACTION_EMOJI_PICKER_MARGIN
      ? rightLeft
      : leftLeft >= REACTION_EMOJI_PICKER_MARGIN
        ? leftLeft
        : rightLeft;

  return {
    left: clamp(left, REACTION_EMOJI_PICKER_MARGIN, maxLeft),
    top: clamp(anchorRect.top, REACTION_EMOJI_PICKER_MARGIN, maxTop),
    width,
    height,
  };
}

function emojiGlyphFromPickerData(data: EmojiClickData): string | null {
  if (data.isCustom === true) return null;
  const emoji = data.emoji.trim();
  return emoji.length > 0 ? emoji : null;
}

function copyTextToClipboard(text: string): void {
  if (typeof navigator === "undefined" || navigator.clipboard == null) {
    return;
  }
  void navigator.clipboard.writeText(text);
}

const WorkspaceReactionEmojiPicker = React.memo(function WorkspaceReactionEmojiPicker({
  open,
  onOpenChange,
  onEmojiPick,
}: WorkspaceReactionEmojiPickerProps): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});

  const updatePickerPosition = useCallback(() => {
    setPickerStyle(getReactionEmojiPickerStyle(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
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
        onClick={(event) => {
          event.preventDefault();
          onOpenChange(!open);
        }}
      >
        <Icon name="plus" size={14} className="text-current" />
      </button>
      {open
        ? createPortal(
            <>
              <div
                data-testid="workspace-message-reaction-emoji-picker-backdrop"
                className="pointer-events-auto fixed inset-0 z-overlay"
                aria-hidden
                onClick={() => onOpenChange(false)}
              />
              <div
                data-testid="workspace-message-reaction-emoji-picker-popover"
                className="pointer-events-auto fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
                style={pickerStyle}
              >
                <EmojiPicker
                  onEmojiClick={onEmojiPick}
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
          )
        : null}
    </div>
  );
});

export const WorkspaceMessageBubbleMenu = React.memo(function WorkspaceMessageBubbleMenu({
  message,
  isOwn,
  open,
  source,
  contextAnchor,
  onSourceChange,
  onOpenChange,
  onReplyMessage,
  onAddReplyMessage,
  onForwardMessage,
  onToggleMessageSelection,
  onEditMessage,
  onRequestDeleteMessage,
  onCopyMessageText,
  onToggleMessageReaction,
  getSelectedText,
}: WorkspaceMessageBubbleMenuProps): React.ReactElement {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setEmojiPickerOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleReaction = useCallback(
    (emojiName: string) => {
      void onToggleMessageReaction?.(message.uuid, emojiName);
      closeMenu();
    },
    [closeMenu, message.uuid, onToggleMessageReaction],
  );

  const handleEmojiPick = useCallback(
    (data: EmojiClickData) => {
      const emojiName = emojiGlyphFromPickerData(data);
      if (emojiName == null) return;
      handleReaction(emojiName);
    },
    [handleReaction],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];

    if (onToggleMessageReaction != null) {
      items.push({
        type: "custom",
        key: "quick-reactions",
        render: () => (
          <div className="flex items-center gap-0.5 border-b border-border-subtle px-3 py-2">
            {QUICK_REACTIONS.map((reaction) => (
              <button
                key={reaction.emojiName}
                type="button"
                className={`${REACTION_BUTTON_CLASS_NAME} text-current`}
                aria-label={t(reaction.labelKey)}
                onClick={(event) => {
                  event.preventDefault();
                  handleReaction(reaction.glyph);
                }}
              >
                <span className="text-[15px] leading-none">{reaction.glyph}</span>
              </button>
            ))}
            <WorkspaceReactionEmojiPicker
              open={emojiPickerOpen}
              onOpenChange={setEmojiPickerOpen}
              onEmojiPick={handleEmojiPick}
            />
          </div>
        ),
      });
    }

    const pushActionSection = (sectionItems: DropdownMenuItem[]) => {
      if (sectionItems.length === 0) return;
      const hasPreviousActionSection = items.some((item) => item.type === "action");
      if (hasPreviousActionSection) {
        items.push({ type: "separator", key: `context-separator-${items.length}` });
      }
      items.push(...sectionItems);
    };

    const primaryActionItems: DropdownMenuItem[] = [];
    if (onReplyMessage != null) {
      primaryActionItems.push({
        type: "action",
        key: "reply",
        icon: "reply",
        label: t("message.reply"),
        onSelect: () => {
          onReplyMessage(message.uuid, getSelectedText());
          closeMenu();
        },
      });
    }
    if (onAddReplyMessage != null) {
      primaryActionItems.push({
        type: "action",
        key: "add-reply",
        icon: "reply",
        label: t("message.addReply"),
        onSelect: () => {
          onAddReplyMessage(message.uuid, getSelectedText());
          closeMenu();
        },
      });
    }
    if (onForwardMessage != null) {
      primaryActionItems.push({
        type: "action",
        key: "forward",
        icon: "forward",
        label: t("message.forward"),
        onSelect: () => {
          onForwardMessage(message.uuid, getSelectedText());
          closeMenu();
        },
      });
    }
    // "Open in chat" belongs in Activity/Feed/search/quotes — not in the in-chat bubble
    // menu, where the message is already shown in its conversation.
    pushActionSection(primaryActionItems);

    const secondaryActionItems: DropdownMenuItem[] = [
      {
        type: "action",
        key: "copy",
        icon: "copy",
        label: t("message.copy"),
        onSelect: () => {
          const selectedText = getSelectedText();
          const textToCopy = selectedText ?? message.payload.content;
          if (onCopyMessageText != null) {
            void onCopyMessageText(message.uuid, textToCopy);
          } else {
            copyTextToClipboard(textToCopy);
          }
          closeMenu();
        },
      },
    ];
    if (onToggleMessageSelection != null) {
      secondaryActionItems.push({
        type: "action",
        key: "select",
        icon: "check",
        label: t("message.select"),
        onSelect: () => {
          onToggleMessageSelection(message.uuid);
          closeMenu();
        },
      });
    }
    pushActionSection(secondaryActionItems);

    const ownItems: DropdownMenuItem[] = [];
    if (isOwn && onEditMessage != null) {
      ownItems.push({
        type: "action",
        key: "edit",
        icon: "pen",
        label: t("message.edit"),
        onSelect: () => {
          onEditMessage(message.uuid);
          closeMenu();
        },
      });
    }
    if (isOwn && onRequestDeleteMessage != null) {
      ownItems.push({
        type: "action",
        key: "delete",
        icon: "delete",
        label: t("message.delete"),
        danger: true,
        onSelect: () => {
          onRequestDeleteMessage(message.uuid);
          closeMenu();
        },
      });
    }
    pushActionSection(ownItems);

    return items;
  }, [
    closeMenu,
    emojiPickerOpen,
    getSelectedText,
    handleEmojiPick,
    handleReaction,
    isOwn,
    message.payload.content,
    message.uuid,
    onAddReplyMessage,
    onCopyMessageText,
    onEditMessage,
    onForwardMessage,
    onReplyMessage,
    onRequestDeleteMessage,
    onToggleMessageSelection,
    onToggleMessageReaction,
  ]);

  const triggerContentProps = useMemo<DropdownMenuContentProps>(
    () => ({
      sideOffset: 4,
      align: isOwn ? "end" : "start",
    }),
    [isOwn],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEmojiPickerOpen(false);
        }
        onOpenChange(nextOpen);
      }}
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
