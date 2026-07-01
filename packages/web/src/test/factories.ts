import type { MessageReactions } from "~/shared/api/messenger.types";
import { normalizeMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

/**
 * Test data factories — typed builders for domain objects.
 *
 * TDD principle: tests should be self-documenting. Factories create
 * valid domain objects with sensible defaults. Override only what matters
 * for the specific test case.
 *
 * Usage:
 *   import { createMessage, createUser, createStream } from "~/test/factories";
 *
 *   const msg = createMessage({ sender_id: 42, content: "Hello" });
 *   const user = createUser({ full_name: "Alice" });
 */

let nextId = 1000;

function autoId(): number {
  return nextId++;
}

function autoUuid(): MessageId {
  const suffix = String(nextId++).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

export function resetFactoryIds(): void {
  nextId = 1000;
}

export function testMessageId(value: MessageId | number): MessageId {
  if (typeof value === "number") {
    const suffix = String(value).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  }
  return normalizeMessageId(value) ?? value;
}

export function testMessageOrdinal(value: MessageId | number): number {
  if (typeof value === "number") {
    return value;
  }
  const normalized = normalizeMessageId(value);
  if (normalized == null) {
    return 0;
  }
  return Number(normalized.slice(-12));
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

interface MessageOverrides {
  id?: MessageId | number;
  sender_id?: number;
  sender_full_name?: string;
  stream_uuid?: string | null;
  author_uuid?: string;
  sender_uuid?: string;
  is_own?: boolean;
  read?: boolean;
  pinned?: boolean;
  starred?: boolean;
  channel?: string;
  subject?: string;
  content?: string;
  timestamp?: number;
  flags?: string[];
  type?: "stream" | "private";
  display_recipient?: string | { id: UserId; full_name: string; email?: string }[];
  avatar_url?: string | null;
  reactions?: MessageReactions;
}

export function createMessage(overrides: MessageOverrides = {}) {
  const id = overrides.id == null ? autoUuid() : testMessageId(overrides.id);
  return {
    id,
    sender_id: overrides.sender_id ?? 1,
    sender_full_name: overrides.sender_full_name ?? "Test User",
    stream_uuid: overrides.stream_uuid ?? autoUuid(),
    ...(overrides.author_uuid != null ? { author_uuid: overrides.author_uuid } : {}),
    ...(overrides.sender_uuid != null ? { sender_uuid: overrides.sender_uuid } : {}),
    ...(overrides.is_own != null ? { is_own: overrides.is_own } : {}),
    ...(overrides.read != null ? { read: overrides.read } : {}),
    ...(overrides.pinned != null ? { pinned: overrides.pinned } : {}),
    ...(overrides.starred != null ? { starred: overrides.starred } : {}),
    channel: overrides.channel ?? "general",
    subject: overrides.subject ?? "test-topic",
    content: overrides.content ?? `Message ${id}`,
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    flags: overrides.flags ?? [],
    type: overrides.type ?? "stream",
    display_recipient: overrides.display_recipient ?? "general",
    avatar_url: overrides.avatar_url ?? null,
    reactions: overrides.reactions ?? {},
  };
}

export function createDmMessage(overrides: MessageOverrides & { to?: number[] } = {}) {
  const recipientIds = overrides.to ?? [1, 2];
  return createMessage({
    type: "private",
    stream_uuid: null,
    channel: undefined,
    display_recipient: recipientIds.map((id) => ({
      id,
      full_name: `User ${id}`,
      email: `user${id}@example.com`,
    })),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

interface UserOverrides {
  user_id?: number;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  presence?: { status: "active" | "idle"; timestamp: number };
}

export function createUser(overrides: UserOverrides = {}) {
  const id = overrides.user_id ?? autoId();
  return {
    user_id: id,
    full_name: overrides.full_name ?? `User ${id}`,
    email: overrides.email ?? `user${id}@example.com`,
    avatar_url: overrides.avatar_url ?? null,
    presence: overrides.presence,
  };
}

// ---------------------------------------------------------------------------
// Stream / Channel
// ---------------------------------------------------------------------------

interface StreamOverrides {
  stream_uuid?: string;
  name?: string;
  description?: string;
}

export function createStream(overrides: StreamOverrides = {}) {
  const uuid = overrides.stream_uuid ?? autoUuid();
  return {
    stream_uuid: uuid,
    name: overrides.name ?? `stream-${uuid.slice(0, 8)}`,
    description: overrides.description ?? "",
  };
}

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

interface InstanceOverrides {
  id?: string;
  login?: string;
  realm?: string;
  iamAccessToken?: string;
}

export function createInstance(overrides: InstanceOverrides = {}) {
  return {
    id: overrides.id ?? `inst-${autoId()}`,
    realm: overrides.realm ?? "https://chat.example.com",
    login: overrides.login ?? "test@example.com",
    authType: "iam",
    iamAccessToken: overrides.iamAccessToken ?? "test-access-token-12345",
  };
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

export function createMessages(count: number, base: MessageOverrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    createMessage({ ...base, timestamp: (base.timestamp ?? 1000) + i }),
  );
}

export function createUsers(count: number) {
  return Array.from({ length: count }, () => createUser());
}
