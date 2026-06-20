/**
 * Parses IAM `/api/core/v1/iam/users/...` payloads and maps them to messenger user shapes.
 *
 * IAM directory rows use the IAM UUID as `user_id` (string). Messenger numeric ids are
 * unchanged for api_key/session auth.
 */
import type { MessengerUserMember } from "./messenger.types";

export interface IamDirectoryUser {
  uuid: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  surname?: string;
  email?: string;
  username?: string;
  status?: string;
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function buildFullNameFromIamUser(user: IamDirectoryUser): string {
  const parts = [user.first_name, user.last_name, user.surname]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name.length > 0) {
    return name;
  }
  const username = typeof user.username === "string" ? user.username.trim() : "";
  return username;
}

function parseIamDirectoryUser(data: unknown): IamDirectoryUser | null {
  if (!isRecord(data)) {
    return null;
  }
  const uuid = typeof data.uuid === "string" ? data.uuid.trim() : "";
  if (uuid.length === 0) {
    return null;
  }
  return {
    uuid,
    name: typeof data.name === "string" ? data.name : undefined,
    first_name: typeof data.first_name === "string" ? data.first_name : undefined,
    last_name: typeof data.last_name === "string" ? data.last_name : undefined,
    surname: typeof data.surname === "string" ? data.surname : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    username: typeof data.username === "string" ? data.username : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    type: typeof data.type === "string" ? data.type : undefined,
  };
}

function mapIamDirectoryUserToMember(user: IamDirectoryUser): MessengerUserMember {
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const status = typeof user.status === "string" ? user.status.trim().toUpperCase() : "";
  return {
    user_id: user.uuid.trim().toLowerCase(),
    full_name: buildFullNameFromIamUser(user),
    email: email.length > 0 ? email : undefined,
    is_active: status === "" || status === "ACTIVE",
  };
}

function extractIamUserListItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data.users)) {
    return data.users;
  }
  return [];
}

/** Maps IAM user list JSON (`GET /api/core/v1/iam/users/`) to messenger member records. */
export function parseIamUserListFromApiData(data: unknown): MessengerUserMember[] {
  const items = extractIamUserListItems(data);
  const members: MessengerUserMember[] = [];
  for (const item of items) {
    const user = parseIamDirectoryUser(item);
    if (user == null) {
      continue;
    }
    members.push(mapIamDirectoryUserToMember(user));
  }
  return members;
}

/** Maps IAM user detail JSON (`GET /api/core/v1/iam/users/{uuid}`) to a messenger member record. */
export function parseIamUserFromApiData(data: unknown): MessengerUserMember | null {
  const user = parseIamDirectoryUser(data);
  if (user == null) {
    return null;
  }
  return mapIamDirectoryUserToMember(user);
}
