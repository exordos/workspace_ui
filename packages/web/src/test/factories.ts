import type { UserPresenceStatus } from "~/entities/user/user.types";

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

export function resetFactoryIds(): void {
  nextId = 1000;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

interface MessageOverrides {
  id?: number;
  sender_id?: number;
  sender_full_name?: string;
  stream_id?: number | null;
  channel?: string;
  subject?: string;
  content?: string;
  timestamp?: number;
  flags?: string[];
  type?: "stream" | "private";
  display_recipient?: string | { id: number; full_name: string; email?: string }[];
  avatar_url?: string | null;
  reactions?: TestMessageReaction[];
}

interface TestMessageReaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

export function createMessage(overrides: MessageOverrides = {}) {
  const id = overrides.id ?? autoId();
  return {
    id,
    sender_id: overrides.sender_id ?? 1,
    sender_full_name: overrides.sender_full_name ?? "Test User",
    stream_id: overrides.stream_id ?? 10,
    channel: overrides.channel ?? "general",
    subject: overrides.subject ?? "test-topic",
    content: overrides.content ?? `Message ${id}`,
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    flags: overrides.flags ?? [],
    type: overrides.type ?? "stream",
    display_recipient: overrides.display_recipient ?? "general",
    avatar_url: overrides.avatar_url ?? null,
    reactions: overrides.reactions ?? [],
  };
}

export function createDmMessage(overrides: MessageOverrides & { to?: number[] } = {}) {
  const recipientIds = overrides.to ?? [1, 2];
  return createMessage({
    type: "private",
    stream_id: null,
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
  uuid?: string;
  username?: string;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string;
  status?:
    | UserPresenceStatus
    | {
        text?: string | null;
        emojiName?: string | null;
        emojiCode?: string | null;
        reactionType?: string | null;
        away?: boolean;
      };
  statusEmoji?: string | null;
  statusText?: string | null;
  statusFetchedAt?: number;
  lastPingAt?: string;
  createdAt?: string;
  updatedAt?: string;
  presence?: { status: "active" | "idle"; timestamp: number };
}

export function createUser(overrides: UserOverrides = {}) {
  const id = overrides.user_id ?? autoId();
  const uuid = overrides.uuid ?? String(id);
  const username = overrides.username ?? `user${id}`;
  const displayName = overrides.displayName ?? overrides.full_name ?? `User ${id}`;
  const legacyStatus = typeof overrides.status === "object" ? overrides.status : null;
  const presenceStatus = overrides.presence?.status;
  const userStatus =
    presenceStatus ??
    (typeof overrides.status === "string" ? overrides.status : undefined) ??
    "offline";
  const statusText = overrides.statusText ?? legacyStatus?.text ?? null;
  const statusEmoji = overrides.statusEmoji ?? legacyStatus?.emojiName ?? null;
  const now = new Date(0).toISOString();
  return {
    user_id: id,
    full_name: displayName,
    email: overrides.email ?? `user${id}@example.com`,
    avatar_url: overrides.avatar_url ?? null,
    presence: overrides.presence,
    uuid,
    username,
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    displayName,
    avatarUrl: overrides.avatar_url ?? null,
    status: userStatus,
    statusEmoji,
    statusText,
    lastPingAt: overrides.lastPingAt ?? now,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// Stream / Channel
// ---------------------------------------------------------------------------

interface StreamOverrides {
  stream_id?: number;
  name?: string;
  description?: string;
}

export function createStream(overrides: StreamOverrides = {}) {
  const id = overrides.stream_id ?? autoId();
  return {
    stream_id: id,
    name: overrides.name ?? `stream-${id}`,
    description: overrides.description ?? "",
  };
}

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

interface InstanceOverrides {
  id?: string;
  realm?: string;
  email?: string;
  apiKey?: string;
}

export function createInstance(overrides: InstanceOverrides = {}) {
  return {
    id: overrides.id ?? `inst-${autoId()}`,
    realm: overrides.realm ?? "https://zulip.example.com",
    email: overrides.email ?? "test@example.com",
    apiKey: overrides.apiKey ?? "test-api-key-12345",
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
