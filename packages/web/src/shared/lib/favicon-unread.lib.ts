/**
 * Draws an unread dot on a favicon image (for external org URLs without a static *-unread pair).
 */
import {
  getUnreadDotCenterTopRight,
  getUnreadDotRadiusPx,
  UNREAD_INDICATOR_COLOR,
} from "~/shared/lib/unread-indicator.lib";

export { UNREAD_INDICATOR_COLOR };

const FAVICON_CANVAS_SIZE = 32;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("favicon image load failed"));
    image.src = src;
  });
}

/** Returns a data URL with an accent dot in the top-right corner. */
export async function drawUnreadDotOnFavicon(baseHref: string): Promise<string> {
  const image = await loadImage(baseHref);
  const canvas = document.createElement("canvas");
  canvas.width = FAVICON_CANVAS_SIZE;
  canvas.height = FAVICON_CANVAS_SIZE;
  const context = canvas.getContext("2d");
  if (context == null) {
    throw new Error("canvas 2d context unavailable");
  }

  const radius = getUnreadDotRadiusPx(FAVICON_CANVAS_SIZE);
  const { x, y } = getUnreadDotCenterTopRight(FAVICON_CANVAS_SIZE);

  context.drawImage(image, 0, 0, FAVICON_CANVAS_SIZE, FAVICON_CANVAS_SIZE);
  context.fillStyle = UNREAD_INDICATOR_COLOR;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();

  return canvas.toDataURL("image/png");
}
