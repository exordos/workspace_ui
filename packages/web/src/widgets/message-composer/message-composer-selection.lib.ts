/**
 * Textarea selection mutations for markdown formatting in the composer.
 */
import type { SelectionMutation } from "./message-composer.types";
import type { RefObject } from "react";

export function mutateSelection(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  onValueChange: (value: string) => void,
  mutate: (selected: string) => SelectionMutation,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end);
  const mutation = mutate(selected);
  const nextValue = text.slice(0, start) + mutation.text + text.slice(end);
  onValueChange(nextValue);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + mutation.selectionStartOffset,
      start + mutation.selectionEndOffset,
    );
  });
}

export function wrapSelection(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  marker: string,
  onValueChange: (value: string) => void,
): void {
  mutateSelection(textareaRef, onValueChange, (selected) => {
    if (selected.length > 0) {
      return {
        text: `${marker}${selected}${marker}`,
        selectionStartOffset: marker.length + selected.length + marker.length,
        selectionEndOffset: marker.length + selected.length + marker.length,
      };
    }
    return {
      text: `${marker}${marker}`,
      selectionStartOffset: marker.length,
      selectionEndOffset: marker.length,
    };
  });
}
