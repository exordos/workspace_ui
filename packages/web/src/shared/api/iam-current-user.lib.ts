/**
 * Parses IAM `GET .../actions/me` payloads into a normalized current-user record.
 */
import { buildFullNameFromIamUser, type IamDirectoryUser } from "./iam-users.lib";
import type { WorkspaceCurrentUser } from "./messenger.types";

export interface IamMeOrganization {
  uuid: string;
  name: string;
  description?: string;
  status?: string;
}

export type IamMeUser = IamDirectoryUser;

export interface IamMeResponse {
  user: IamMeUser;
  organization: IamMeOrganization[];
  project_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
    user_id: user.uuid.trim().toLowerCase(),
    full_name: buildFullNameFromIamUser(user),
    email,
  };
}
