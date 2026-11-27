import { isNewlineCommand, isSendCommand } from "./message-composer-input-commands.lib";
import { applyListContinuationOnNewline } from "./message-composer-list-continuation.lib";
import type { ComposerSuggestion } from "./message-composer-mention-dropdown.types";
import type { MessageComposerWriteBodyProps } from "./message-composer-write-body.types";
import type { KeyboardEvent, RefObject } from "react";

export interface HandleComposerWriteBodyKeyDownOptions {
  event: KeyboardEvent<HTMLTextAreaElement>;
  value: string;
  showMentions: boolean;
  mentionSuggestions: readonly ComposerSuggestion[];
  activeMentionIndex: number;
  sendNewlineMode: MessageComposerWriteBodyProps["sendNewlineMode"];
  isEditing: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onActiveMentionIndexChange: MessageComposerWriteBodyProps["onActiveMentionIndexChange"];
  onMentionSelect: (suggestion: ComposerSuggestion) => void;
  onHideMentionDropdown: MessageComposerWriteBodyProps["onHideMentionDropdown"];
  onValueChange: MessageComposerWriteBodyProps["onValueChange"];
  onDetectMention: MessageComposerWriteBodyProps["onDetectMention"];
  onSend: MessageComposerWriteBodyProps["onSend"];
  onCancelEdit?: MessageComposerWriteBodyProps["onCancelEdit"];
}

function handleMentionNavigation(
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: Pick<
    HandleComposerWriteBodyKeyDownOptions,
    | "showMentions"
    | "mentionSuggestions"
    | "onActiveMentionIndexChange"
    | "onHideMentionDropdown"
    | "onMentionSelect"
    | "activeMentionIndex"
  >,
): boolean {
  if (!options.showMentions) return false;

  if (options.mentionSuggestions.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options.onActiveMentionIndexChange((prev) =>
        prev >= options.mentionSuggestions.length - 1 ? prev : prev + 1,
      );
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      options.onActiveMentionIndexChange((prev) => (prev <= 0 ? 0 : prev - 1));
      return true;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const activeSuggestion = options.mentionSuggestions[options.activeMentionIndex];
      if (activeSuggestion) {
        options.onMentionSelect(activeSuggestion);
      }
      return true;
    }
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    options.onHideMentionDropdown();
    return true;
  }

  return false;
}

function handleSendOrNewline(
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: Pick<
    HandleComposerWriteBodyKeyDownOptions,
    | "sendNewlineMode"
    | "showMentions"
    | "value"
    | "textareaRef"
    | "onHideMentionDropdown"
    | "onSend"
    | "onValueChange"
    | "onDetectMention"
  >,
): boolean {
  if (isSendCommand(event, options.sendNewlineMode)) {
    event.preventDefault();
    if (options.showMentions) {
      options.onHideMentionDropdown();
    }
    // Holding Enter must not send the message more than once.
    if (!event.repeat) void options.onSend();
    return true;
  }

  if (!isNewlineCommand(event, options.sendNewlineMode)) {
    return false;
  }

  const textarea = options.textareaRef.current;
  if (!textarea) return false;

  const selectionStart = textarea.selectionStart ?? options.value.length;
  const selectionEnd = textarea.selectionEnd ?? options.value.length;
  const continuation = applyListContinuationOnNewline({
    text: options.value,
    selectionStart,
    selectionEnd,
  });
  if (continuation == null) return false;

  event.preventDefault();
  options.onValueChange(continuation.nextValue);
  options.onDetectMention(continuation.nextValue, continuation.nextSelection);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(continuation.nextSelection, continuation.nextSelection);
  });
  return true;
}

/** Local editor keys run before configurable application shortcuts. */
export function handleComposerWriteBodyKeyDown(
  options: HandleComposerWriteBodyKeyDownOptions,
): void {
  const { event } = options;
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;

  if (handleMentionNavigation(event, options)) return;

  if (event.key === "Escape" && options.isEditing && options.onCancelEdit != null) {
    event.preventDefault();
    event.stopPropagation();
    options.onCancelEdit();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    options.textareaRef.current?.blur();
    return;
  }

  if (handleSendOrNewline(event, options)) return;
}
