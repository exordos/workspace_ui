import { getUser } from "./workspace-client";
import type { WorkspaceClientOptions } from "./workspace-client";

export type WorkspaceMessengerAuthProfileStatus = "active" | "idle" | "offline" | "do_not_disturb";

export interface WorkspaceMessengerAuthProfileDto {
  uuid: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: WorkspaceMessengerAuthProfileStatus | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalStatus(value: unknown): WorkspaceMessengerAuthProfileStatus | null {
  return value === "active" || value === "idle" || value === "offline" || value === "do_not_disturb"
    ? value
    : null;
}

function unwrapProfilePayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isRecord(value.user)) return value.user;
  if (isRecord(value.data)) return value.data;
  if (isRecord(value.result)) return value.result;
  return value;
}

export function parseWorkspaceMessengerAuthProfile(
  value: unknown,
): WorkspaceMessengerAuthProfileDto | null {
  const payload = unwrapProfilePayload(value);
  if (!isRecord(payload) || typeof payload.uuid !== "string") {
    return null;
  }
  return {
    uuid: payload.uuid,
    username: optionalString(payload.username),
    first_name: optionalString(payload.first_name),
    last_name: optionalString(payload.last_name),
    email: optionalString(payload.email),
    status: optionalStatus(payload.status),
  };
}

export async function getWorkspaceMessengerAuthProfile(
  options: WorkspaceClientOptions,
  userUuid: string,
): Promise<WorkspaceMessengerAuthProfileDto> {
  const profile = parseWorkspaceMessengerAuthProfile(await getUser(options, userUuid));
  if (profile == null) {
    throw new TypeError("messenger auth profile response parse failed");
  }
  return profile;
}
