import React from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { ComposerMentionDropdown } from "./message-composer-mention-dropdown.ui";
import { handleComposerWriteBodyKeyDown } from "./message-composer-write-body-keydown.lib";
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
  sendNewlineMode,
  onEditLastMessage,
  isEditing = false,
  onCancelEdit,
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
          handleComposerWriteBodyKeyDown({
            event: e,
            value,
            showMentions,
            mentionSuggestions,
            activeMentionIndex,
            sendNewlineMode,
            isEditing,
            textareaRef,
            applyFormattingShortcut,
            onActiveMentionIndexChange,
            onMentionSelect,
            onHideMentionDropdown,
            onValueChange,
            onDetectMention,
            onSend,
            onEditLastMessage,
            onCancelEdit,
          });
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`max-h-32 min-h-10 w-full min-w-0 resize-none border-0 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-composer-icon focus-visible:outline-none focus-visible:ring-0 ${SCROLL_AREA_CLASS}`}
        style={{ display: "block" }}
      />
    </>
  );
});
