const MAX_COMPOSER_KEYBOARD_INSET_PX = 480;

export function resolveComposerKeyboardInsetPx({
  isWebViewMode,
  isKeyboardOpen,
  keyboardHeight,
}: {
  isWebViewMode: boolean;
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}): number {
  if (!isWebViewMode || !isKeyboardOpen) return 0;
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return 0;
  return Math.min(MAX_COMPOSER_KEYBOARD_INSET_PX, Math.floor(keyboardHeight));
}
