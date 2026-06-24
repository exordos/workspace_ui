export const LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY = "workspace-sidebar-width";
export const LAYOUT_SIDEBAR_WIDTH_DEFAULT = 299;
export const LAYOUT_SIDEBAR_WIDTH_MIN_FALLBACK = 240;
export const LAYOUT_SIDEBAR_WIDTH_MAX_FALLBACK = 720;
export const LAYOUT_SIDEBAR_WIDTH_MIN_RATIO = 0.12;
export const LAYOUT_SIDEBAR_WIDTH_MAX_RATIO = 0.4;

export interface LayoutSidebarWidthBounds {
  min: number;
  max: number;
}

function resolveViewportWidth(viewportWidth?: number): number | null {
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth)) {
    return viewportWidth;
  }
  if (typeof window === "undefined") return null;
  return window.innerWidth;
}

export function getLayoutSidebarWidthBounds(viewportWidth?: number): LayoutSidebarWidthBounds {
  const resolvedViewportWidth = resolveViewportWidth(viewportWidth);
  if (resolvedViewportWidth == null) {
    return {
      min: LAYOUT_SIDEBAR_WIDTH_MIN_FALLBACK,
      max: LAYOUT_SIDEBAR_WIDTH_MAX_FALLBACK,
    };
  }

  const max = Math.max(
    LAYOUT_SIDEBAR_WIDTH_MIN_FALLBACK,
    Math.min(
      LAYOUT_SIDEBAR_WIDTH_MAX_FALLBACK,
      Math.round(resolvedViewportWidth * LAYOUT_SIDEBAR_WIDTH_MAX_RATIO),
    ),
  );
  const min = Math.min(
    max,
    Math.max(
      LAYOUT_SIDEBAR_WIDTH_MIN_FALLBACK,
      Math.round(resolvedViewportWidth * LAYOUT_SIDEBAR_WIDTH_MIN_RATIO),
    ),
  );

  return { min, max };
}

function normalizeLayoutSidebarPreferredWidth(value: number): number {
  if (!Number.isFinite(value)) return LAYOUT_SIDEBAR_WIDTH_DEFAULT;
  return Math.round(value);
}

export function clampLayoutSidebarWidth(
  value: number,
  bounds: LayoutSidebarWidthBounds = getLayoutSidebarWidthBounds(),
): number {
  const normalizedValue = normalizeLayoutSidebarPreferredWidth(value);
  return Math.min(bounds.max, Math.max(bounds.min, normalizedValue));
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage != null) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadLayoutSidebarWidth(storage?: Storage): number {
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage == null) return LAYOUT_SIDEBAR_WIDTH_DEFAULT;
  try {
    const raw = resolvedStorage.getItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw == null) return LAYOUT_SIDEBAR_WIDTH_DEFAULT;
    return normalizeLayoutSidebarPreferredWidth(Number(raw));
  } catch {
    return LAYOUT_SIDEBAR_WIDTH_DEFAULT;
  }
}

export function saveLayoutSidebarWidth(
  width: number,
  storage?: Storage,
  bounds: LayoutSidebarWidthBounds = getLayoutSidebarWidthBounds(),
): void {
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage == null) return;
  try {
    resolvedStorage.setItem(
      LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampLayoutSidebarWidth(width, bounds)),
    );
  } catch {
    // ignore
  }
}
