/** Parses `?msg=` anchor id from messenger route search string. */
export function parseFocusedMessageIdFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get("msg");
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
