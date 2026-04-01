import React from "react";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { ComposerMentionDropdown } from "./message-composer-mention-dropdown.ui";
import type { MessageComposerWriteBodyProps } from "./message-composer-write-body.types";

export const MessageComposerWriteBody = React.memo(function MessageComposerWriteBody({
  value,
  placeholder,
  disabled,
  textareaRef,
  showMentions,
  mentionSuggestions,
  activeMentionIndex,
  onActiveMentionIndexChange,
  onMentionSelect,
  onHideMentionDropdown,
  onValueChange,
  onDetectMention,
  applyFormattingShortcut,
  onPaste,
  onSend,
  onEditLastMessage,
}: MessageComposerWriteBodyProps) {
  return (
    <>
      {showMentions && (
        <ComposerMentionDropdown
          suggestions={mentionSuggestions}
          activeIndex={activeMentionIndex}
          onSelect={onMentionSelect}
          onHoverIndex={onActiveMentionIndexChange}
        />
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onPaste={onPaste}
        onChange={(e) => {
          onValueChange(e.target.value);
          onDetectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          const normalizedKey = e.key.toLowerCase();
          const isModPressed = e.metaKey || e.ctrlKey;
          if (isModPressed && !e.altKey) {
            if (normalizedKey === "b") {
              e.preventDefault();
              applyFormattingShortcut("**");
              return;
            }
            if (normalizedKey === "i") {
              e.preventDefault();
              applyFormattingShortcut("*");
              return;
            }
            if (normalizedKey === "e") {
              e.preventDefault();
              applyFormattingShortcut("`");
              return;
            }
            if (normalizedKey === "x" && e.shiftKey) {
              e.preventDefault();
              applyFormattingShortcut("~~");
              return;
            }
          }

          if (
            e.key === "ArrowUp" &&
            !showMentions &&
            value.length === 0 &&
            !e.shiftKey &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            onEditLastMessage != null
          ) {
            e.preventDefault();
            onEditLastMessage();
            return;
          }

          if (showMentions && mentionSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onActiveMentionIndexChange((prev) =>
                prev >= mentionSuggestions.length - 1 ? prev : prev + 1,
              );
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onActiveMentionIndexChange((prev) => (prev <= 0 ? 0 : prev - 1));
              return;
            }
          }
          if (showMentions && e.key === "Escape") {
            e.preventDefault();
            onHideMentionDropdown();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            if (showMentions && mentionSuggestions.length > 0) {
              e.preventDefault();
              const activeSuggestion = mentionSuggestions[activeMentionIndex];
              if (activeSuggestion) {
                onMentionSelect(activeSuggestion);
              }
              return;
            }
            e.preventDefault();
            if (showMentions) {
              onHideMentionDropdown();
            }
            void onSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`max-h-32 min-h-10 w-full min-w-0 resize-none border-0 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-composer-icon ${SCROLL_AREA_CLASS}`}
      />
    </>
  );
});
