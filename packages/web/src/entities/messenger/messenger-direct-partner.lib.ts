import type { MessengerConversation, MessengerStream, MessengerUuid } from "./messenger.types";

/** Fields needed to identify a private chat. */
export type WorkspaceDirectPartnerSource = Pick<
  MessengerStream | MessengerConversation,
  "isPrivate"
> & {
  directUserUuid?: MessengerUuid | null;
};

export interface ResolveWorkspaceDirectPartnerInput {
  /** The route stream, or its conversation when the stream is missing. */
  source: WorkspaceDirectPartnerSource | null | undefined;
  /** Stream members from its bindings. */
  memberUserUuids: readonly MessengerUuid[];
  /** Current user UUID needed to exclude the user from the member list. */
  currentUserUuid: MessengerUuid | null | undefined;
}

const DIRECT_MEMBER_COUNT = 2;

function normalizeUuid(value: MessengerUuid | null | undefined): MessengerUuid | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueMemberUuids(memberUserUuids: readonly MessengerUuid[]): MessengerUuid[] {
  const seen = new Set<MessengerUuid>();
  for (const memberUserUuid of memberUserUuids) {
    const normalized = normalizeUuid(memberUserUuid);
    if (normalized == null) continue;
    seen.add(normalized);
  }
  return [...seen];
}

/** Returns the direct partner UUID, or `null` when the chat should remain a channel. */
export function resolveWorkspaceDirectPartnerUuid({
  source,
  memberUserUuids,
  currentUserUuid,
}: ResolveWorkspaceDirectPartnerInput): MessengerUuid | null {
  if (source?.isPrivate !== true) return null;

  const explicitPartnerUuid = normalizeUuid(source.directUserUuid);
  if (explicitPartnerUuid != null) return explicitPartnerUuid;

  const currentUuid = normalizeUuid(currentUserUuid);
  if (currentUuid == null) return null;

  const members = uniqueMemberUuids(memberUserUuids);
  if (members.length !== DIRECT_MEMBER_COUNT) return null;

  const partnerUuids = members.filter((memberUserUuid) => memberUserUuid !== currentUuid);
  // One other member means the remaining member is the current user.
  return partnerUuids.length === 1 ? (partnerUuids[0] ?? null) : null;
}
