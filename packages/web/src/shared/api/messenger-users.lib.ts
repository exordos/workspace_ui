/**
 * Parsers for Workspace gateway GET /api/messenger/v1/users/ rows.
 */
import type { MessengerUserMember } from "./messenger.types";

interface MessengerGatewayUserRow {
  uuid: string;
  username?: string;
  status?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    first_name: readString(data.first_name),
    last_name: readString(data.last_name),
    email: readString(data.email),
    avatar_url: typeof data.avatar_url === "string" ? data.avatar_url.trim() : null,
  };
}

export function parseMessengerGatewayUser(data: unknown): MessengerUserMember | null {
  const user = parseGatewayUserRow(data);
  if (user == null) {
    return null;
  }
  const email = readString(user.email);
  const status = readString(user.status).toUpperCase();
  return {
    user_id: user.uuid,
    full_name: buildFullName(user),
    ...(email.length > 0 ? { email } : {}),
    ...(user.avatar_url != null && user.avatar_url.length > 0
      ? { avatar_url: user.avatar_url }
      : {}),
    is_active: status === "" || status === "ACTIVE",
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
