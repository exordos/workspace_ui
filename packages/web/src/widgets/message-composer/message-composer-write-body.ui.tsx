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
  textareaId,
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
  fillAvailableHeight = false,
  reserveExpandControlSpace = false,
  compactInline = false,
}: MessageComposerWriteBodyProps) {
  const listboxId = `${textareaId}-suggestions`;
  const activeSuggestion = mentionSuggestions[activeMentionIndex];
  const activeDescendantId =
    showMentions && activeSuggestion != null
      ? `${listboxId}-option-${activeMentionIndex}`
      : undefined;

  const refreshSuggestionsAtCursor = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea == null) return;
    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) {
      onHideMentionDropdown();
      return;
    }
    onDetectMention(value, selectionStart);
  }, [onDetectMention, onHideMentionDropdown, textareaRef, value]);

  return (
    <>
      {showMentions && (
        <ComposerMentionDropdown
          suggestions={mentionSuggestions}
          activeIndex={activeMentionIndex}
          listboxId={listboxId}
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
        onClick={refreshSuggestionsAtCursor}
        onSelect={refreshSuggestionsAtCursor}
        onKeyUp={(e) => {
          if (
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "Home" ||
            e.key === "End"
          ) {
            refreshSuggestionsAtCursor();
          }
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
        aria-controls={showMentions ? listboxId : undefined}
        aria-activedescendant={activeDescendantId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        rows={1}
        className={`${
          fillAvailableHeight ? "h-full max-h-none" : "max-h-32"
        } min-h-10 w-full min-w-0 resize-none border-0 bg-transparent text-base text-text-primary outline-none placeholder:text-composer-icon focus-visible:outline-none focus-visible:ring-0 ${
          compactInline ? "px-0 py-2" : "px-5 py-2"
        } ${reserveExpandControlSpace ? "pr-16" : ""} ${SCROLL_AREA_CLASS}`}
        style={{ display: "block" }}
      />
    </>
  );
});
