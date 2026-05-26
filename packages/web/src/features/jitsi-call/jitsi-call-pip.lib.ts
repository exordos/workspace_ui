export interface PipWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_PIP_WIDTH = 320;
const DEFAULT_PIP_HEIGHT = 220;
const PIP_WINDOW_MARGIN = 20;

export function getDefaultPipWindowBounds(): PipWindowBounds {
  if (typeof window === "undefined") {
    return {
      x: 0,
      y: 0,
      width: DEFAULT_PIP_WIDTH,
      height: DEFAULT_PIP_HEIGHT,
    };
  }
  return {
    x: Math.max(PIP_WINDOW_MARGIN, window.innerWidth - DEFAULT_PIP_WIDTH - PIP_WINDOW_MARGIN),
    y: Math.max(PIP_WINDOW_MARGIN, window.innerHeight - DEFAULT_PIP_HEIGHT - PIP_WINDOW_MARGIN),
    width: DEFAULT_PIP_WIDTH,
    height: DEFAULT_PIP_HEIGHT,
  };
}
