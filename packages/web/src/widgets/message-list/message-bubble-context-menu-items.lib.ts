import type { ContextItemLabel } from "./message-bubble-context.lib";

export function preventDefaultAndRun(
  handler: () => void,
): (event: { preventDefault: () => void }) => void {
  return (event) => {
    event.preventDefault();
    handler();
  };
}

export function createQuickReactionClickHandler(
  onQuickReaction: (emojiName: string) => void,
  emojiName: string,
): (event: { preventDefault: () => void }) => void {
  return preventDefaultAndRun(() => {
    onQuickReaction(emojiName);
  });
}

export function createEmojiPickerToggleHandler(
  emojiPickerOpen: boolean,
  onEmojiPickerOpenChange: (open: boolean) => void,
): (event: { preventDefault: () => void }) => void {
  return preventDefaultAndRun(() => {
    onEmojiPickerOpenChange(!emojiPickerOpen);
  });
}

export function createContextMenuItemSelectHandler(
  onMenuItem: (label: ContextItemLabel) => void,
  label: ContextItemLabel,
): () => void {
  return () => {
    onMenuItem(label);
  };
}
