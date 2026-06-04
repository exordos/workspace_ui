import { KEYBOARD_SHORTCUTS_ENABLED } from "~/shared/config/constants";
import { isNewlineCommand, isSendCommand } from "./message-composer-input-commands.lib";
import { applyListContinuationOnNewline } from "./message-composer-list-continuation.lib";
import type { MessageComposerWriteBodyProps } from "./message-composer-write-body.types";
import type { KeyboardEvent, RefObject } from "react";

type MentionSuggestion = MessageComposerWriteBodyProps["mentionSuggestions"][number];

export interface HandleComposerWriteBodyKeyDownOptions {
  event: KeyboardEvent<HTMLTextAreaElement>;
  value: string;
  showMentions: boolean;
  mentionSuggestions: readonly MentionSuggestion[];
  activeMentionIndex: number;
  sendNewlineMode: MessageComposerWriteBodyProps["sendNewlineMode"];
  isEditing: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  applyFormattingShortcut: MessageComposerWriteBodyProps["applyFormattingShortcut"];
  onActiveMentionIndexChange: MessageComposerWriteBodyProps["onActiveMentionIndexChange"];
  onMentionSelect: MessageComposerWriteBodyProps["onMentionSelect"];
  onHideMentionDropdown: MessageComposerWriteBodyProps["onHideMentionDropdown"];
  onValueChange: MessageComposerWriteBodyProps["onValueChange"];
  onDetectMention: MessageComposerWriteBodyProps["onDetectMention"];
  onSend: MessageComposerWriteBodyProps["onSend"];
  onEditLastMessage?: MessageComposerWriteBodyProps["onEditLastMessage"];
  onCancelEdit?: MessageComposerWriteBodyProps["onCancelEdit"];
}

function handleFormattingShortcuts(
  event: KeyboardEvent<HTMLTextAreaElement>,
  applyFormattingShortcut: MessageComposerWriteBodyProps["applyFormattingShortcut"],
): boolean {
  const normalizedKey = event.key.toLowerCase();
  const isModPressed = event.metaKey || event.ctrlKey;
  if (!isModPressed || event.altKey) return false;

  if (normalizedKey === "b") {
    event.preventDefault();
    applyFormattingShortcut("**");
    return true;
  }
  if (normalizedKey === "i") {
    event.preventDefault();
    applyFormattingShortcut("*");
    return true;
  }
  if (normalizedKey === "e") {
    event.preventDefault();
    applyFormattingShortcut("`");
    return true;
  }
  if (normalizedKey === "x" && event.shiftKey) {
    event.preventDefault();
    applyFormattingShortcut("~~");
    return true;
  }
  return false;
}

function handleEditLastMessageShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: Pick<
    HandleComposerWriteBodyKeyDownOptions,
    "value" | "showMentions" | "isEditing" | "onEditLastMessage"
  >,
): boolean {
  if (event.key !== "ArrowUp") return false;
  if (options.showMentions || options.value.length > 0 || options.isEditing) return false;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (options.onEditLastMessage == null) return false;
  event.preventDefault();
  options.onEditLastMessage();
  return true;
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
    void options.onSend();
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

/** Keyboard handler for composer textarea (formatting, mentions, send, list continuation). */
export function handleComposerWriteBodyKeyDown(
  options: HandleComposerWriteBodyKeyDownOptions,
): void {
  const { event } = options;

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

  if (!KEYBOARD_SHORTCUTS_ENABLED) return;

  if (handleFormattingShortcuts(event, options.applyFormattingShortcut)) return;

  handleEditLastMessageShortcut(event, {
    value: options.value,
    showMentions: options.showMentions,
    isEditing: options.isEditing,
    onEditLastMessage: options.onEditLastMessage,
  });
}
