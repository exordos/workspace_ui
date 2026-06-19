export function readViewportState(): { windowFocused: boolean; windowHidden: boolean } {
  if (typeof document === "undefined") {
    return { windowFocused: true, windowHidden: false };
  }
  return {
    windowFocused: document.hasFocus(),
    windowHidden: document.hidden,
  };
}
