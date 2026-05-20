// message-composer-write-body.ui.tsx
// Назначение:
// - Текстовый ввод composer: textarea, mention dropdown и keyboard-обработчики.
// Правило приоритетов клавиш:
// - formatting shortcuts -> mention navigation/select -> edit actions -> send/newline.
// Важно:
// - Режим send/newline берется из input-command resolver, а list continuation — из отдельного helper.
import React from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { isNewlineCommand, isSendCommand } from "./message-composer-input-commands.lib";
import { applyListContinuationOnNewline } from "./message-composer-list-continuation.lib";
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
          const normalizedKey = e.key.toLowerCase();
          const isModPressed = e.metaKey || e.ctrlKey;
          // 1) Сначала форматирующие shortcut-ы, чтобы не конкурировать с send/newline.
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
            !isEditing &&
            onEditLastMessage != null
          ) {
            e.preventDefault();
            onEditLastMessage();
            return;
          }

          if (e.key === "Escape" && isEditing && onCancelEdit != null) {
            e.preventDefault();
            onCancelEdit();
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

          // 2) Enter при активных mention-саджестах выбирает пользователя, а не отправляет.
          if (e.key === "Enter" && !e.shiftKey && showMentions && mentionSuggestions.length > 0) {
            e.preventDefault();
            const activeSuggestion = mentionSuggestions[activeMentionIndex];
            if (activeSuggestion) {
              onMentionSelect(activeSuggestion);
            }
            return;
          }

          if (isSendCommand(e, sendNewlineMode)) {
            // 3) Команда отправки централизована в резолвере режимов ввода.
            e.preventDefault();
            if (showMentions) {
              onHideMentionDropdown();
            }
            void onSend();
            return;
          }

          if (isNewlineCommand(e, sendNewlineMode)) {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const selectionStart = textarea.selectionStart ?? value.length;
            const selectionEnd = textarea.selectionEnd ?? value.length;
            const continuation = applyListContinuationOnNewline({
              text: value,
              selectionStart,
              selectionEnd,
            });
            if (continuation == null) return;

            // 4) Перехватываем только list-continuation; обычный перенос остается нативным.
            e.preventDefault();
            onValueChange(continuation.nextValue);
            onDetectMention(continuation.nextValue, continuation.nextSelection);
            requestAnimationFrame(() => {
              textarea.focus();
              textarea.setSelectionRange(continuation.nextSelection, continuation.nextSelection);
            });
          }
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
