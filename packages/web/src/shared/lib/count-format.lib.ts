export const UNREAD_COUNT_DISPLAY_LIMIT = 1000;

/** Keep source counters numeric; optionally compact their presentation into whole thousands. */
export function formatCount(count: number, displayLimit?: number): string {
  return displayLimit != null && count > displayLimit
    ? `${Math.floor(count / 1000)}k+`
    : String(count);
}
