/**
 * Parses IAM `GET .../actions/me` payloads into a normalized current-user record.
 */
import type { WorkspaceCurrentUser } from "./messenger.types";

/** Temporary messenger user_id until per-server identity mapping is implemented. */
export const TEMPORARY_MESSENGER_USER_ID = 9;

export interface IamMeOrganization {
  uuid: string;
  name: string;
  description?: string;
  status?: string;
}

export interface IamMeUser {
  uuid: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  surname?: string;
  email?: string;
  username?: string;
  status?: string;
}

export interface IamMeResponse {
  user: IamMeUser;
  organization: IamMeOrganization[];
  project_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildFullNameFromIamUser(user: IamMeUser): string {
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

function parseIamMeUser(data: unknown): IamMeUser | null {
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
  };
}

/** Maps IAM `/actions/me` JSON to the workspace current-user shape. */
export function parseIamCurrentUserFromApiData(data: unknown): WorkspaceCurrentUser | null {
  if (!isRecord(data)) {
    return null;
  }

  const user = parseIamMeUser(data.user);
  if (user == null) {
    return null;
  }

  const email = typeof user.email === "string" ? user.email.trim() : "";

  return {
    user_id: TEMPORARY_MESSENGER_USER_ID,
    full_name: buildFullNameFromIamUser(user),
    email,
    iam_user_uuid: user.uuid,
  };
}
