/**
 * Parsers for Workspace gateway GET /api/messenger/v1/users/ rows.
 */
import type { MessengerUserMember, WorkspaceUserPresenceStatus } from "./messenger.types";

const USER_PRESENCE_STATUSES: readonly WorkspaceUserPresenceStatus[] = [
  "active",
  "idle",
  "offline",
  "do_not_disturb",
];

interface MessengerGatewayUserRow {
  uuid: string;
  username?: string;
  status?: string;
  has_status_fields?: boolean;
  status_emoji?: string | null;
  status_text?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string | null;
  last_ping_at?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePresenceStatus(value: unknown): WorkspaceUserPresenceStatus {
  const normalized = readString(value).toLowerCase();
  return (USER_PRESENCE_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as WorkspaceUserPresenceStatus)
    : "offline";
}

function timestampFromValue(value: unknown): number {
  const raw = readOptionalString(value);
  if (raw == null) {
    return Math.floor(Date.now() / 1000);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

function buildFullName(user: MessengerGatewayUserRow): string {
  const parts = [user.first_name, user.last_name]
    .map((part) => readString(part))
    .filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return readString(user.username);
}

function buildCustomStatus(
  user: MessengerGatewayUserRow,
  presenceStatus: WorkspaceUserPresenceStatus,
): MessengerUserMember["status"] | undefined {
  const text = readOptionalString(user.status_text) ?? "";
  const emojiName = readOptionalString(user.status_emoji);
  const away = presenceStatus === "idle";
  if (text.length === 0 && emojiName == null && !away && user.has_status_fields !== true) {
    return undefined;
  }
  if (text.length === 0 && emojiName == null && !away) {
    return null;
  }
  return {
    text,
    ...(emojiName != null ? { emojiName } : {}),
    away,
  };
}

function parseGatewayUserRow(data: unknown): MessengerGatewayUserRow | null {
  if (!isRecord(data)) {
    return null;
  }
  const uuid = readString(data.uuid).toLowerCase();
  if (uuid.length === 0) {
    return null;
  }
  return {
    uuid,
    username: readString(data.username),
    status: readString(data.status),
    has_status_fields: "status_emoji" in data || "status_text" in data,
    status_emoji: readOptionalString(data.status_emoji),
    status_text: readOptionalString(data.status_text),
    first_name: readString(data.first_name),
    last_name: readString(data.last_name),
    email: readString(data.email),
    avatar_url: readOptionalString(data.avatar) ?? readOptionalString(data.avatar_url),
    last_ping_at: readOptionalString(data.last_ping_at),
  };
}

export function parseMessengerGatewayUser(data: unknown): MessengerUserMember | null {
  const user = parseGatewayUserRow(data);
  if (user == null) {
    return null;
  }
  const email = readString(user.email);
  const presenceStatus = normalizePresenceStatus(user.status);
  const customStatus = buildCustomStatus(user, presenceStatus);
  return {
    user_id: user.uuid,
    full_name: buildFullName(user),
    ...(email.length > 0 ? { email } : {}),
    ...(user.avatar_url != null && user.avatar_url.length > 0
      ? { avatar_url: user.avatar_url }
      : {}),
    presence: {
      status: presenceStatus,
      timestamp: timestampFromValue(user.last_ping_at),
    },
    ...(customStatus !== undefined ? { status: customStatus } : {}),
    is_active: true,
  };
}

export function parseMessengerGatewayUserList(data: unknown): MessengerUserMember[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const members: MessengerUserMember[] = [];
  for (const row of data) {
    const member = parseMessengerGatewayUser(row);
    if (member != null) {
      members.push(member);
    }
  }
  return members;
}
