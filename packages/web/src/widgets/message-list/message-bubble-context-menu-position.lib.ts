const FEED_MARGIN_PX = 8;
const CURSOR_GAP_PX = 6;

// Используем оценочные размеры меню, чтобы заранее выбрать правильную точку якоря.
export const MESSAGE_CONTEXT_MENU_EST_WIDTH_PX = 200;
export const MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX = 320;

export type MessageContextMenuSide = "left" | "right";

export interface MessageContextMenuBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MessageContextMenuPositionInput {
  clientX: number;
  clientY: number;
  bounds: MessageContextMenuBounds;
  menuWidth: number;
  menuHeight: number;
}

export interface MessageContextMenuPosition {
  menuLeft: number;
  menuTop: number;
  side: MessageContextMenuSide;
}

// Ограничивает значение в заданных пределах.
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function computeMessageContextMenuPosition({
  clientX,
  clientY,
  bounds,
  menuWidth,
  menuHeight,
}: MessageContextMenuPositionInput): MessageContextMenuPosition {
  // Границы, внутри которых меню обязано оставаться.
  const minLeft = bounds.left + FEED_MARGIN_PX;
  const maxLeft = bounds.right - FEED_MARGIN_PX - menuWidth;
  const minTop = bounds.top + FEED_MARGIN_PX;
  const maxTop = bounds.bottom - FEED_MARGIN_PX - menuHeight;

  // Сравниваем свободное место справа и слева от курсора.
  const spaceRight = bounds.right - FEED_MARGIN_PX - clientX;
  const spaceLeft = clientX - (bounds.left + FEED_MARGIN_PX);
  const prefersRight = spaceRight >= menuWidth + CURSOR_GAP_PX;
  const side: MessageContextMenuSide = prefersRight || spaceRight >= spaceLeft ? "right" : "left";

  // Базовая позиция: рядом с курсором, затем — clamp по границам чата.
  const desiredLeft =
    side === "right" ? clientX + CURSOR_GAP_PX : clientX - CURSOR_GAP_PX - menuWidth;
  const menuLeft = clamp(desiredLeft, minLeft, Math.max(minLeft, maxLeft));
  const menuTop = clamp(clientY, minTop, Math.max(minTop, maxTop));

  return {
    menuLeft,
    menuTop,
    side,
  };
}
