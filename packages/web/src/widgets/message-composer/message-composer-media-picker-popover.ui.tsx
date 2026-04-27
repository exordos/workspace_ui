import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import React from "react";
import { buildStickerMarkdown } from "~/entities/sticker/sticker.api";
import { StickerPicker } from "~/features/sticker-picker/sticker-picker.ui";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { EMOJI_PICKER_WIDTH, MEDIA_PICKER_CONTENT_HEIGHT } from "./message-composer-constants.lib";
import type { MessageComposerMediaPickerPopoverProps } from "./message-composer-media-picker-popover.types";

export const MessageComposerMediaPickerPopover = React.memo(
  function MessageComposerMediaPickerPopover({
    mediaPickerStyle,
    mediaPickerTab,
    onClose,
    onTabChange,
    onEmojiClick,
    onStickerSelect,
    customEmojis,
  }: MessageComposerMediaPickerPopoverProps) {
    return (
      <>
        <div className="fixed inset-0 z-dropdown" aria-hidden onClick={onClose} />
        <div
          className="fixed z-modal max-h-[min(400px,60vh)] overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          style={mediaPickerStyle}
          role="dialog"
          data-testid="composer-media-picker"
          aria-label={mediaPickerTab === "emoji" ? t("a11y.emoji") : t("a11y.stickers")}
        >
          <div
            className="flex items-center gap-1 border-b border-border-subtle bg-card-bg px-2 py-1.5"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-label={t("a11y.emoji")}
              aria-selected={mediaPickerTab === "emoji"}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                mediaPickerTab === "emoji"
                  ? "bg-bg text-text-primary"
                  : "text-text-muted hover:bg-bg hover:text-text-primary"
              }`}
              onClick={() => {
                onTabChange("emoji");
              }}
            >
              <Icon name="mood" size={18} />
            </button>
            <button
              type="button"
              role="tab"
              aria-label={t("a11y.stickers")}
              aria-selected={mediaPickerTab === "sticker"}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                mediaPickerTab === "sticker"
                  ? "bg-bg text-text-primary"
                  : "text-text-muted hover:bg-bg hover:text-text-primary"
              }`}
              onClick={() => {
                onTabChange("sticker");
              }}
            >
              <Icon name="smile" size={18} />
            </button>
          </div>
          {mediaPickerTab === "emoji" ? (
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              customEmojis={customEmojis}
              className="composer-emoji-picker"
              emojiStyle={EmojiStyle.NATIVE}
              theme={document.documentElement.dataset.theme === "light" ? Theme.LIGHT : Theme.DARK}
              width={Number(mediaPickerStyle.width ?? EMOJI_PICKER_WIDTH)}
              height={MEDIA_PICKER_CONTENT_HEIGHT}
              searchDisabled={false}
              previewConfig={{ showPreview: false }}
            />
          ) : (
            <StickerPicker
              embedded
              onSelect={(sticker) => {
                onStickerSelect(buildStickerMarkdown(sticker));
              }}
              onClose={onClose}
            />
          )}
        </div>
      </>
    );
  },
);
