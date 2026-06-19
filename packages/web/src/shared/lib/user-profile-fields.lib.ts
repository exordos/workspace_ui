/**
 * Workspace custom profile fields (`profile_data` on GET /users).
 *
 * Converts server `value` / `rendered_value` pairs into safe display lines
 * (sanitized HTML or plain text). Field order follows numeric id when possible.
 * With realm field definitions, manager / person-picker fields can resolve to a user id for profile links.
 */

import { sanitizeHtml } from "~/shared/lib/html";
import {
  realmCustomProfileFieldIsManager,
  type RealmProfileFieldDefinition,
} from "~/shared/lib/messenger-profile-fields-map.lib";
import { parseWorkspacePersonPickerUserIds } from "~/shared/lib/user-profile-picker-parse.lib";

export { parseWorkspacePersonPickerUserIds } from "~/shared/lib/user-profile-picker-parse.lib";

export interface WorkspaceCustomProfileFieldEntry {
  value?: string;
  rendered_value?: string;
}

export type WorkspaceCustomProfileDataMap = Readonly<
  Record<string, WorkspaceCustomProfileFieldEntry>
>;

export interface CustomProfileFieldLine {
  fieldKey: string;
  /** Sanitized snippet from `rendered_value` when non-empty after sanitization. */
  html: string | null;
  /** Plain `value` when there is no usable rendered HTML. */
  plainText: string | null;
  /** Workspace person-picker / user-mention in manager field — link to this user's profile. */
  managerProfileUserId?: number;
  /** Label if the users store has not loaded the manager's name yet. */
  managerDisplayFallback?: string;
}

/** Extracts `data-user-id` from the messenger API-rendered profile HTML (e.g. user mentions). */
export function extractUserIdsFromMessengerProfileHtml(html: string): number[] {
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

function findRealmFieldDefinition(
  fieldKey: string,
  fieldDefinitions: readonly RealmProfileFieldDefinition[] | null | undefined,
): RealmProfileFieldDefinition | undefined {
  if (fieldDefinitions == null || fieldDefinitions.length === 0) return undefined;
  const fieldIdNum = Number.parseInt(fieldKey, 10);
  if (!Number.isFinite(fieldIdNum) || String(fieldIdNum) !== fieldKey.trim()) {
    return undefined;
  }
  return fieldDefinitions.find((f) => f.id === fieldIdNum);
}

function buildManagerProfileFieldLine(
  fieldKey: string,
  entry: WorkspaceCustomProfileFieldEntry,
  plain: string | undefined,
): CustomProfileFieldLine | null {
  const rendered = entry.rendered_value?.trim();
  let pickerIds = parseWorkspacePersonPickerUserIds(entry.value);
  if (pickerIds.length === 0 && rendered != null && rendered.length > 0) {
    pickerIds = extractUserIdsFromMessengerProfileHtml(rendered);
  }
  if (pickerIds.length === 0) return null;
  const uid = pickerIds[0]!;
  return {
    fieldKey,
    html: null,
    plainText: null,
    managerProfileUserId: uid,
    managerDisplayFallback: plain != null && plain.length > 0 ? plain : undefined,
  };
}

function buildRenderedOrPlainProfileFieldLine(
  fieldKey: string,
  entry: WorkspaceCustomProfileFieldEntry,
  baseUrl: string | undefined,
): CustomProfileFieldLine | null {
  const rendered = entry.rendered_value?.trim();
  const plain = entry.value?.trim();
  if (rendered != null && rendered.length > 0) {
    const safe = sanitizeHtml(rendered, baseUrl);
    if (safe.trim().length > 0) {
      return { fieldKey, html: safe, plainText: null };
    }
  }
  if (plain != null && plain.length > 0) {
    return { fieldKey, html: null, plainText: plain };
  }
  return null;
}

function buildCustomProfileFieldLine(
  fieldKey: string,
  entry: WorkspaceCustomProfileFieldEntry,
  baseUrl: string | undefined,
  fieldDefinitions: readonly RealmProfileFieldDefinition[] | null | undefined,
): CustomProfileFieldLine | null {
  const plain = entry.value?.trim();
  const fieldDef = findRealmFieldDefinition(fieldKey, fieldDefinitions);
  if (fieldDef != null && realmCustomProfileFieldIsManager(fieldDef)) {
    return buildManagerProfileFieldLine(fieldKey, entry, plain);
  }
  return buildRenderedOrPlainProfileFieldLine(fieldKey, entry, baseUrl);
}

/** Builds ordered display lines for custom profile data (GET /users `profile_data`). */
export function getCustomProfileFieldLines(
  profileData: WorkspaceCustomProfileDataMap | undefined | null,
  baseUrl?: string,
  fieldDefinitions?: readonly RealmProfileFieldDefinition[] | null,
): CustomProfileFieldLine[] {
  if (profileData == null || typeof profileData !== "object") return [];
  const keys = sortProfileFieldKeys(Object.keys(profileData));
  const out: CustomProfileFieldLine[] = [];
  for (const fieldKey of keys) {
    const entry = profileData[fieldKey];
    if (entry == null) continue;
    const line = buildCustomProfileFieldLine(fieldKey, entry, baseUrl, fieldDefinitions);
    if (line != null) out.push(line);
  }
  return out;
}

/** Deep equality for chat-info member profile payloads (stable key order). */
export function areCustomProfileDataEqual(
  a: WorkspaceCustomProfileDataMap | undefined | null,
  b: WorkspaceCustomProfileDataMap | undefined | null,
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
