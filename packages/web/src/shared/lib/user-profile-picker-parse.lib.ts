/**
 * Parses Zulip person-picker profile field values into numeric user ids.
 */

function parsePersonPickerIdsFromJson(text: string): number[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => (typeof x === "number" ? x : Number(x)))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return [parsed];
    }
  } catch {
    /* fall through to bracket / numeric forms */
  }
  return [];
}

function parsePersonPickerIdFromBracket(text: string): number | null {
  const bracket = /^\[(\d+)\]$/.exec(text);
  if (!bracket) return null;
  const id = Number(bracket[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parsePersonPickerIdFromDigits(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

/** Parses Zulip person-picker `value` (e.g. `"[42]"` per GET /users examples) or plain numeric id. */
export function parseZulipPersonPickerUserIds(value: string | undefined | null): number[] {
  if (value == null) return [];
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  const fromJson = parsePersonPickerIdsFromJson(trimmed);
  if (fromJson.length > 0) return fromJson;

  const fromBracket = parsePersonPickerIdFromBracket(trimmed);
  if (fromBracket != null) return [fromBracket];

  const fromDigits = parsePersonPickerIdFromDigits(trimmed);
  return fromDigits != null ? [fromDigits] : [];
}
