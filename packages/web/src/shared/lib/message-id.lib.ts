export type MessageId = string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_BYTE_LENGTH = 16;

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function createUuidFromBytes(bytes: Uint8Array): MessageId {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, byteToHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function createFallbackUuid(): MessageId {
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.getRandomValues === "function") {
    cryptoObject.getRandomValues(bytes);
    return createUuidFromBytes(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return createUuidFromBytes(bytes);
}

export function isMessageId(value: unknown): value is MessageId {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function normalizeMessageId(value: unknown): MessageId | null {
  if (!isMessageId(value)) {
    return null;
  }
  return value.trim().toLowerCase();
}

export function createMessageId(): MessageId {
  const cryptoObject = globalThis.crypto;
  const randomUuid = cryptoObject?.randomUUID;
  return typeof randomUuid === "function" ? randomUuid.call(cryptoObject) : createFallbackUuid();
}

export function compareMessageTimeline(
  left: { id: MessageId; timestamp?: number },
  right: { id: MessageId; timestamp?: number },
): number {
  const leftTimestamp = left.timestamp ?? 0;
  const rightTimestamp = right.timestamp ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return left.id.localeCompare(right.id);
}
