const PICKER_VIEWPORT_MARGIN = 8;
const PICKER_GAP = 8;

interface PickerPositionInput {
  anchorRect: Pick<DOMRect, "left" | "top" | "bottom" | "width"> | null;
  pickerWidth: number;
  pickerHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function computeFloatingPickerPosition({
  anchorRect,
  pickerWidth,
  pickerHeight,
  viewportWidth,
  viewportHeight,
}: PickerPositionInput): { left: number; top: number; width: number } {
  const width = Math.min(pickerWidth, Math.max(160, viewportWidth - PICKER_VIEWPORT_MARGIN * 2));
  const fallbackTop = Math.max(
    PICKER_VIEWPORT_MARGIN,
    viewportHeight - pickerHeight - PICKER_VIEWPORT_MARGIN,
  );
  if (anchorRect == null) {
    return { left: PICKER_VIEWPORT_MARGIN, top: fallbackTop, width };
  }

  const desiredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const maxLeft = Math.max(PICKER_VIEWPORT_MARGIN, viewportWidth - width - PICKER_VIEWPORT_MARGIN);
  const left = Math.min(Math.max(PICKER_VIEWPORT_MARGIN, desiredLeft), maxLeft);

  const topAbove = anchorRect.top - pickerHeight - PICKER_GAP;
  if (topAbove >= PICKER_VIEWPORT_MARGIN) {
    return { left, top: topAbove, width };
  }

  const topBelow = anchorRect.bottom + PICKER_GAP;
  const maxTop = Math.max(
    PICKER_VIEWPORT_MARGIN,
    viewportHeight - pickerHeight - PICKER_VIEWPORT_MARGIN,
  );
  return {
    left,
    top: Math.min(Math.max(PICKER_VIEWPORT_MARGIN, topBelow), maxTop),
    width,
  };
}
