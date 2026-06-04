import type { Reaction } from "~/shared/api/zulip.types";

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
  reactions?: Reaction[];
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
