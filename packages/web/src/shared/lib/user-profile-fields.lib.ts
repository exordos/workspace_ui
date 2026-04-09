/**
 * Zulip custom profile fields (`profile_data` on GET /users).
 *
 * Converts server `value` / `rendered_value` pairs into safe display lines
 * (sanitized HTML or plain text). Field order follows numeric id when possible.
 * With realm field definitions, manager / person-picker fields can resolve to a user id for profile links.
 */

import { sanitizeHtml } from "~/shared/lib/html";
import {
  realmCustomProfileFieldIsManager,
  type RealmProfileFieldDefinition,
} from "~/shared/lib/zulip-profile-fields-map.lib";

export type ZulipCustomProfileFieldEntry = {
  value?: string;
  rendered_value?: string;
};

export type ZulipCustomProfileDataMap = Readonly<Record<string, ZulipCustomProfileFieldEntry>>;

export type CustomProfileFieldLine = {
  fieldKey: string;
  /** Sanitized snippet from `rendered_value` when non-empty after sanitization. */
  html: string | null;
  /** Plain `value` when there is no usable rendered HTML. */
  plainText: string | null;
  /** Zulip person-picker / user-mention in manager field — link to this user's profile. */
  managerProfileUserId?: number;
  /** Label if the users store has not loaded the manager's name yet. */
  managerDisplayFallback?: string;
};

/**
 * Parses Zulip person-picker `value` (e.g. `"[42]"` per GET /users examples) or plain numeric id.
 */
export function parseZulipPersonPickerUserIds(value: string | undefined | null): number[] {
  if (value == null) return [];
  const t = value.trim();
  if (t.length === 0) return [];
  try {
    const p: unknown = JSON.parse(t);
    if (Array.isArray(p)) {
      return p
        .map((x) => (typeof x === "number" ? x : Number(x)))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (typeof p === "number" && Number.isFinite(p) && p > 0) {
      return [p];
    }
  } catch {
    /* fall through */
  }
  const bracket = /^\[(\d+)\]$/.exec(t);
  if (bracket) {
    const id = Number(bracket[1]);
    return Number.isFinite(id) && id > 0 ? [id] : [];
  }
  if (/^\d+$/.test(t)) {
    const id = Number(t);
    return id > 0 ? [id] : [];
  }
  return [];
}

/** Extracts `data-user-id` from Zulip-rendered profile HTML (e.g. user mentions). */
export function extractUserIdsFromZulipProfileHtml(html: string): number[] {
  const ids: number[] = [];
  const re = /data-user-id="(\d+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id > 0 && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function sortProfileFieldKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    const aNum = Number.isFinite(na) && String(na) === a;
    const bNum = Number.isFinite(nb) && String(nb) === b;
    if (aNum && bNum) return na - nb;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return a.localeCompare(b);
  });
}

/** Builds ordered display lines for custom profile data (GET /users `profile_data`). */
export function getCustomProfileFieldLines(
  profileData: ZulipCustomProfileDataMap | undefined | null,
  baseUrl?: string,
  fieldDefinitions?: readonly RealmProfileFieldDefinition[] | null,
): CustomProfileFieldLine[] {
  if (profileData == null || typeof profileData !== "object") return [];
  const keys = sortProfileFieldKeys(Object.keys(profileData));
  const out: CustomProfileFieldLine[] = [];
  for (const fieldKey of keys) {
    const entry = profileData[fieldKey];
    if (entry == null) continue;
    const rendered = entry.rendered_value?.trim();
    const plain = entry.value?.trim();

    const fieldIdNum = Number.parseInt(fieldKey, 10);
    const fieldDef =
      fieldDefinitions != null &&
      fieldDefinitions.length > 0 &&
      Number.isFinite(fieldIdNum) &&
      String(fieldIdNum) === fieldKey.trim()
        ? fieldDefinitions.find((f) => f.id === fieldIdNum)
        : undefined;

    if (fieldDef != null && realmCustomProfileFieldIsManager(fieldDef)) {
      let pickerIds = parseZulipPersonPickerUserIds(entry.value);
      if (pickerIds.length === 0 && rendered != null && rendered.length > 0) {
        pickerIds = extractUserIdsFromZulipProfileHtml(rendered);
      }
      if (pickerIds.length > 0) {
        const uid = pickerIds[0]!;
        out.push({
          fieldKey,
          html: null,
          plainText: null,
          managerProfileUserId: uid,
          managerDisplayFallback: plain != null && plain.length > 0 ? plain : undefined,
        });
        continue;
      }
    }

    if (rendered != null && rendered.length > 0) {
      const safe = sanitizeHtml(rendered, baseUrl);
      if (safe.trim().length > 0) {
        out.push({ fieldKey, html: safe, plainText: null });
        continue;
      }
    }
    if (plain != null && plain.length > 0) {
      out.push({ fieldKey, html: null, plainText: plain });
    }
  }
  return out;
}

/** Deep equality for chat-info member profile payloads (stable key order). */
export function areCustomProfileDataEqual(
  a: ZulipCustomProfileDataMap | undefined | null,
  b: ZulipCustomProfileDataMap | undefined | null,
): boolean {
  if (a === b) return true;
  if (a == null) return b == null;
  if (b == null) return false;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]!;
    if (k !== keysB[i]) return false;
    const va = a[k];
    const vb = b[k];
    if (va?.value !== vb?.value || va?.rendered_value !== vb?.rendered_value) return false;
  }
  return true;
}
