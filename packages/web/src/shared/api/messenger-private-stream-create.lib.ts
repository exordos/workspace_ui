/**
 * Builds POST bodies for gateway private (1:1) message streams and stream member actions.
 *
 * Flow:
 * 1. POST /streams/ — `WorkspaceStream` (`ModelWithRequiredNameDesc` + native source + direct peer)
 * 2. The backend creates private participant bindings for direct streams.
 */

export const MESSENGER_STREAM_SOURCE_NAME_NATIVE = "native" as const;
export const MESSENGER_STREAM_BINDING_ROLE_OWNER = "owner" as const;
export const MESSENGER_STREAM_BINDING_ROLE_MEMBER = "member" as const;

export type MessengerStreamBindingRole =
  | typeof MESSENGER_STREAM_BINDING_ROLE_OWNER
  | typeof MESSENGER_STREAM_BINDING_ROLE_MEMBER;

export interface MessengerStreamNativeSource {
  kind: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE;
}

export interface CreatePrivateMessageStreamBody {
  name: string;
  description: string;
  source_name: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE;
  source: MessengerStreamNativeSource;
  direct_user_uuid: string;
}

export interface AddStreamUsersBody {
  [MESSENGER_STREAM_BINDING_ROLE_OWNER]?: string[];
  [MESSENGER_STREAM_BINDING_ROLE_MEMBER]?: string[];
}

/** Resolves a non-empty stream title for ModelWithRequiredNameDesc.name. */
export function resolvePrivateMessageStreamName(
  peerDisplayName: string,
  peerUserUuid: string,
): string {
  const trimmedName = peerDisplayName.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  return peerUserUuid.trim();
}

/** POST /api/messenger/v1/streams/ payload for a new 1:1 private stream. */
export function buildCreatePrivateMessageStreamBody(options: {
  peerUserUuid: string;
  peerDisplayName: string;
}): CreatePrivateMessageStreamBody {
  const peerUserUuid = options.peerUserUuid.trim();
  return {
    name: resolvePrivateMessageStreamName(options.peerDisplayName, peerUserUuid),
    description: "",
    source_name: MESSENGER_STREAM_SOURCE_NAME_NATIVE,
    source: { kind: MESSENGER_STREAM_SOURCE_NAME_NATIVE },
    direct_user_uuid: peerUserUuid,
  };
}

/** POST /api/messenger/v1/streams/{uuid}/actions/add_users/invoke payload. */
export function buildAddStreamUsersBody(options: {
  userUuids: readonly string[];
  role?: MessengerStreamBindingRole;
}): AddStreamUsersBody {
  const userUuids = Array.from(
    new Set(
      options.userUuids
        .map((userUuid) => userUuid.trim().toLowerCase())
        .filter((userUuid) => userUuid.length > 0),
    ),
  );
  const role = options.role ?? MESSENGER_STREAM_BINDING_ROLE_OWNER;
  return {
    [role]: userUuids,
  };
}

function readTrimmedUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parses `POST /streams/` WorkspaceStream response. */
export function parseCreatedWorkspaceStream(row: unknown): {
  streamUuid: string;
  name: string;
  ownerUserUuid?: string;
} | null {
  if (typeof row !== "object" || row == null) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const streamUuid = readTrimmedUuid(record.stream_uuid) ?? readTrimmedUuid(record.uuid);
  const name =
    typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : null;
  if (streamUuid == null || name == null) {
    return null;
  }
  const ownerUserUuid = readTrimmedUuid(record.owner) ?? readTrimmedUuid(record.user_uuid);
  return {
    streamUuid,
    name,
    ...(ownerUserUuid != null ? { ownerUserUuid: ownerUserUuid.toLowerCase() } : {}),
  };
}
