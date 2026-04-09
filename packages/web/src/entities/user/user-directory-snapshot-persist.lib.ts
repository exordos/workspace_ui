/**
 * Maps GET /users payloads to IndexedDB rows (directory fields only; no presence/status).
 */
import type { ZulipUserMember } from "~/shared/api/zulip.types";
import { persistUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";

/** Non-empty API response only — empty array must not overwrite a good on-disk snapshot. */
export function shouldPersistUsersDirectorySnapshot(members: ZulipUserMember[]): boolean {
  return members.length > 0;
}

/** Strips volatile store-only fields; keeps Zulip directory shape for mergeUsers. */
export function serializeDirectoryMembersForSnapshot(members: ZulipUserMember[]): ZulipUserMember[] {
  const out: ZulipUserMember[] = [];
  for (const m of members) {
    if (m.user_id == null) continue;
    out.push({
      user_id: m.user_id,
      full_name: m.full_name,
      email: m.email,
      avatar_url: m.avatar_url ?? undefined,
      role: m.role,
      profile_data: m.profile_data,
    });
  }
  return out;
}

export async function persistUsersDirectoryToIndexedDb(
  instanceId: string,
  members: ZulipUserMember[],
): Promise<void> {
  if (!shouldPersistUsersDirectorySnapshot(members)) return;
  await persistUsersDirectoryRow({
    instanceId,
    version: 1,
    savedAt: Date.now(),
    members: serializeDirectoryMembersForSnapshot(members),
  });
}
