/**
 * IAM REST API client (Exordos Core `/api/core/v1/iam/...`).
 *
 * Uses the shared HTTP middleware pipeline with Bearer auth for IAM instances.
 */
import { resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { getCurrentInstance, messengerApi } from "./client";
import { parseIamCurrentUserFromApiData } from "./iam-current-user.lib";
import type { WorkspaceCurrentUser } from "./messenger.types";

/** IAM client UUID for the current-user profile action. */
export const IAM_ME_CLIENT_ID = "00000000-0000-0000-0000-000000000000";

export function buildIamMePath(clientId: string = IAM_ME_CLIENT_ID): string {
  return `/api/core/v1/iam/clients/${clientId}/actions/me`;
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
