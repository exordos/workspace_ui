/**
 * Builds POST bodies for gateway private (1:1) message streams and peer bindings.
 *
 * Flow:
 * 1. POST /streams/ — `WorkspaceStream` (`ModelWithRequiredNameDesc` + native source)
 * 2. POST /stream_bindings/ — peer binding with role `owner` (initiator binding is auto-created)
 */

export const MESSENGER_STREAM_SOURCE_NAME_NATIVE = "native" as const;
export const MESSENGER_STREAM_BINDING_ROLE_OWNER = "owner" as const;

export interface MessengerStreamNativeSource {
  kind: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE;
}

export interface CreatePrivateMessageStreamBody {
  private: true;
  name: string;
  description: string;
  source_name: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE;
  source: MessengerStreamNativeSource;
}

export interface CreateStreamBindingBody {
  stream_uuid: string;
  user_uuid: string;
  role: typeof MESSENGER_STREAM_BINDING_ROLE_OWNER;
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

/** POST /api/messanger/v1/streams/ payload for a new 1:1 private stream. */
export function buildCreatePrivateMessageStreamBody(options: {
  peerUserUuid: string;
  peerDisplayName: string;
}): CreatePrivateMessageStreamBody {
  const peerUserUuid = options.peerUserUuid.trim();
  return {
    private: true,
    name: resolvePrivateMessageStreamName(options.peerDisplayName, peerUserUuid),
    description: "",
    source_name: MESSENGER_STREAM_SOURCE_NAME_NATIVE,
    source: { kind: MESSENGER_STREAM_SOURCE_NAME_NATIVE },
  };
}

/** POST /api/messanger/v1/stream_bindings/ payload for the DM peer. */
export function buildCreateStreamBindingBody(options: {
  streamUuid: string;
  peerUserUuid: string;
}): CreateStreamBindingBody {
  return {
    stream_uuid: options.streamUuid.trim(),
    user_uuid: options.peerUserUuid.trim(),
    role: MESSENGER_STREAM_BINDING_ROLE_OWNER,
  };
}

function readTrimmedUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parses `POST /streams/` WorkspaceStream response (`uuid` is the stream id). */
export function parseCreatedWorkspaceStream(
  row: unknown,
): { streamUuid: string; name: string } | null {
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
  return { streamUuid, name };
}
