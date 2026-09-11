import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { MessengerUuid } from "./messenger.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MessengerMessageIdentity {
  canonicalMessageUuid: MessengerUuid;
  placementUuid: MessengerUuid;
}

export function normalizeMessengerMessageUuid(uuid: MessengerUuid): MessengerUuid {
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError(`Expected a hyphenated UUID, received: ${uuid}`);
  }
  return uuid.toLowerCase();
}

function uuidBytes(uuid: MessengerUuid): Uint8Array {
  return hexToBytes(uuid.replaceAll("-", ""));
}

function formatUuid(bytes: Uint8Array): MessengerUuid {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function createMessengerPlacementUuid(
  topicUuid: MessengerUuid,
  canonicalMessageUuid: MessengerUuid,
): MessengerUuid {
  const normalizedTopicUuid = normalizeMessengerMessageUuid(topicUuid);
  const normalizedCanonicalMessageUuid = normalizeMessengerMessageUuid(canonicalMessageUuid);
  // UUIDv5 requires SHA-1; this mirrors the public Workspace backend identity contract.
  const digest = sha1(
    concatBytes(uuidBytes(normalizedTopicUuid), utf8ToBytes(normalizedCanonicalMessageUuid)),
  ).slice(0, 16);

  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(digest);
}

export function createMessengerMessageIdentity(
  topicUuid: MessengerUuid,
  canonicalMessageUuid: MessengerUuid = crypto.randomUUID(),
): MessengerMessageIdentity {
  const normalizedCanonicalMessageUuid = normalizeMessengerMessageUuid(canonicalMessageUuid);
  return {
    canonicalMessageUuid: normalizedCanonicalMessageUuid,
    placementUuid: createMessengerPlacementUuid(topicUuid, normalizedCanonicalMessageUuid),
  };
}
