/**
 * IAM REST API client (Exordos Core `/api/core/v1/iam/...`).
 *
 * Uses the shared HTTP middleware pipeline with Bearer auth for IAM instances.
 */
import { resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { getCurrentInstance, messengerApi } from "./client";
import { parseIamCurrentUserFromApiData } from "./iam-current-user.lib";
import { parseIamUserFromApiData, parseIamUserListFromApiData } from "./iam-users.lib";
import type { MessengerUserMember, WorkspaceCurrentUser } from "./messenger.types";

/** IAM client UUID for the current-user profile action. */
export const IAM_ME_CLIENT_ID = "00000000-0000-0000-0000-000000000000";

export const IAM_USERS_PATH = "/api/core/v1/iam/users/";

export function buildIamMePath(clientId: string = IAM_ME_CLIENT_ID): string {
  return `/api/core/v1/iam/clients/${clientId}/actions/me`;
}

export function buildIamUserPath(userUuid: string): string {
  const normalized = userUuid.trim();
  return `${IAM_USERS_PATH}${normalized}`;
}

export async function iamGet(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  const instance = getCurrentInstance();
  if (instance?.authType !== "iam") {
    return null;
  }
  const origin = resolveIamApiOrigin(instance);
  if (origin === "") {
    return null;
  }
  try {
    const response = await messengerApi.getWithBase(origin, path, params, signal);
    return {
      ok: response.ok,
      status: response.status,
      data: response.data,
    };
  } catch {
    return null;
  }
}

/** Fetches the authenticated IAM user profile (`GET .../actions/me`). */
export async function getIamCurrentUser(options?: {
  signal?: AbortSignal;
}): Promise<WorkspaceCurrentUser | null> {
  const res = await iamGet(buildIamMePath(), undefined, options?.signal);
  if (res?.ok !== true) {
    return null;
  }
  return parseIamCurrentUserFromApiData(res.data);
}

/** Fetches the IAM user directory (`GET /api/core/v1/iam/users/`). */
export async function fetchIamUsers(options?: {
  signal?: AbortSignal;
}): Promise<MessengerUserMember[]> {
  const res = await iamGet(IAM_USERS_PATH, undefined, options?.signal);
  if (res?.ok !== true) {
    return [];
  }
  return parseIamUserListFromApiData(res.data);
}

/** Fetches a single IAM user by UUID (`GET /api/core/v1/iam/users/{uuid}`). */
export async function fetchIamUserByUuid(
  userUuid: string,
  options?: { signal?: AbortSignal },
): Promise<MessengerUserMember | null> {
  const normalized = userUuid.trim();
  if (normalized.length === 0) {
    return null;
  }
  const res = await iamGet(buildIamUserPath(normalized), undefined, options?.signal);
  if (res?.ok !== true) {
    return null;
  }
  return parseIamUserFromApiData(res.data);
}
