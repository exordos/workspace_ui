import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { resolveIamAccessToken } from "~/shared/lib/iam-instance.lib";
import { createLogger } from "~/shared/lib/logger";
import {
  getCurrentInstance,
  getWorkspaceCommonApiBaseForCurrentInstance,
  messengerApi,
} from "./client";

const log = createLogger("messenger-avatar-settings");
const MAX_AVATAR_FILE_SIZE_MIB = 25;

interface AvatarResponse {
  avatar?: unknown;
  message?: unknown;
}

export interface OwnAvatarCapabilities {
  maxAvatarFileSizeMib: number;
  avatarChangesDisabled: boolean;
}

export type AvatarMutationErrorKind = "forbidden" | "invalid" | "unsupported" | "transient";

export type AvatarMutationResult =
  | { ok: true; avatarUrl: string | null }
  | { ok: false; kind: AvatarMutationErrorKind; message: string };

function ownUserUuid(): string | null {
  const instance = getCurrentInstance();
  if (instance == null) return null;
  return resolveUserUuidFromAccessToken(resolveIamAccessToken(instance));
}

function avatarActionPath(userUuid: string, action: "avatar_upload" | "avatar_reset"): string {
  return `/users/${userUuid}/actions/${action}/invoke`;
}

function mutationErrorKind(status: number): AvatarMutationErrorKind {
  if (status === 400 || status === 413 || status === 415) return "invalid";
  if (status === 401 || status === 403 || status === 404) return "forbidden";
  if (status === 405) return "unsupported";
  return "transient";
}

function mutationError(data: unknown, status: number, fallback: string): AvatarMutationResult {
  const payload = data as AvatarResponse | null;
  const message =
    typeof payload?.message === "string" && payload.message.trim() !== ""
      ? payload.message
      : `${fallback} (HTTP ${status})`;
  return { ok: false, kind: mutationErrorKind(status), message };
}

function mutationSuccess(data: unknown): AvatarMutationResult {
  const avatar = (data as AvatarResponse | null)?.avatar;
  return {
    ok: true,
    avatarUrl: typeof avatar === "string" && avatar.trim() !== "" ? avatar.trim() : null,
  };
}

export function getOwnAvatarCapabilities(): OwnAvatarCapabilities {
  return {
    maxAvatarFileSizeMib: MAX_AVATAR_FILE_SIZE_MIB,
    avatarChangesDisabled: false,
  };
}

export async function uploadOwnAvatar(file: File): Promise<AvatarMutationResult> {
  const userUuid = ownUserUuid();
  if (userUuid == null) {
    return { ok: false, kind: "transient", message: "No active IAM user" };
  }
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await messengerApi.postFormDataWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      avatarActionPath(userUuid, "avatar_upload"),
      form,
    );
    return response.ok
      ? mutationSuccess(response.data)
      : mutationError(response.data, response.status, "Failed to upload avatar");
  } catch (error) {
    log.warn("Failed to upload own avatar", { error: String(error) });
    return { ok: false, kind: "transient", message: String(error) };
  }
}

export async function removeOwnAvatar(): Promise<AvatarMutationResult> {
  const userUuid = ownUserUuid();
  if (userUuid == null) {
    return { ok: false, kind: "transient", message: "No active IAM user" };
  }
  try {
    const response = await messengerApi.postJsonWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      avatarActionPath(userUuid, "avatar_reset"),
      {},
    );
    return response.ok
      ? mutationSuccess(response.data)
      : mutationError(response.data, response.status, "Failed to reset avatar");
  } catch (error) {
    log.warn("Failed to reset own avatar", { error: String(error) });
    return { ok: false, kind: "transient", message: String(error) };
  }
}
