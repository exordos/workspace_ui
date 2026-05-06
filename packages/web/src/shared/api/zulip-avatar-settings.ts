import { createLogger } from "~/shared/lib/logger";
import {
  getCurrentInstance,
  refreshWorkspaceApiBase,
  refreshZulipApiBase,
  zulipApi,
} from "./client";
import { getCachedOwnAvatarCapabilities } from "./zulip-queue";
import type { ZulipOwnAvatarCapabilities } from "./zulip.types";

const FALLBACK_MAX_AVATAR_FILE_SIZE_MIB = 25;

const log = createLogger("zulip-avatar-settings");

interface AvatarResponsePayload {
  result?: string;
  msg?: string;
  code?: string;
  avatar_url?: unknown;
}

export interface OwnAvatarCapabilities {
  maxAvatarFileSizeMib: number;
  realmAvatarChangesDisabled: boolean;
  serverAvatarChangesDisabled: boolean;
  avatarChangesDisabled: boolean;
}

export type AvatarMutationErrorKind = "forbidden" | "invalid" | "unsupported" | "transient";

export type AvatarMutationResult =
  | {
      ok: true;
      avatarUrl: string | null;
    }
  | {
      ok: false;
      status: number;
      kind: AvatarMutationErrorKind;
      message: string;
      code?: string;
    };

export interface UploadOwnAvatarOptions {
  signal?: AbortSignal;
}

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapMutationError(status: number): AvatarMutationErrorKind {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid";
  if (status === 404 || status === 405) return "unsupported";
  return "transient";
}

function buildCapabilities(cached: ZulipOwnAvatarCapabilities): OwnAvatarCapabilities {
  const realmAvatarChangesDisabled = cached.realm_avatar_changes_disabled === true;
  const serverAvatarChangesDisabled = cached.server_avatar_changes_disabled === true;
  const maxAvatarFileSizeMib = cached.max_avatar_file_size_mib ?? FALLBACK_MAX_AVATAR_FILE_SIZE_MIB;
  return {
    maxAvatarFileSizeMib,
    realmAvatarChangesDisabled,
    serverAvatarChangesDisabled,
    avatarChangesDisabled: realmAvatarChangesDisabled || serverAvatarChangesDisabled,
  };
}

function buildNoInstanceError(): AvatarMutationResult {
  return {
    ok: false,
    status: 0,
    kind: "transient",
    message: "No active instance",
  };
}

function readErrorMessage(data: AvatarResponsePayload, status: number, fallback: string): string {
  if (typeof data.msg === "string" && data.msg.trim().length > 0) {
    return data.msg;
  }
  if (typeof data.code === "string" && data.code.trim().length > 0) {
    return data.code;
  }
  if (status > 0) {
    return `${fallback} (HTTP ${status})`;
  }
  return fallback;
}

export function getOwnAvatarCapabilities(): OwnAvatarCapabilities {
  return buildCapabilities(getCachedOwnAvatarCapabilities());
}

export async function uploadOwnAvatar(
  file: File,
  options?: UploadOwnAvatarOptions,
): Promise<AvatarMutationResult> {
  if (getCurrentInstance() == null) {
    return buildNoInstanceError();
  }

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();

    const form = new FormData();
    form.append("file", file);

    const response = await zulipApi.postFormData("/users/me/avatar", form, options?.signal);
    const data = (response.data ?? {}) as AvatarResponsePayload;

    if (!response.ok || data.result === "error") {
      return {
        ok: false,
        status: response.status,
        kind: mapMutationError(response.status),
        message: readErrorMessage(data, response.status, "Failed to upload avatar"),
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    }

    return {
      ok: true,
      avatarUrl: normalizeAvatarUrl(data.avatar_url),
    };
  } catch (err) {
    log.warn("Failed to upload own avatar", { error: String(err) });
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: String(err),
    };
  }
}

export async function removeOwnAvatar(): Promise<AvatarMutationResult> {
  if (getCurrentInstance() == null) {
    return buildNoInstanceError();
  }

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();

    const response = await zulipApi.delete("/users/me/avatar");
    const data = (response.data ?? {}) as AvatarResponsePayload;

    if (!response.ok || data.result === "error") {
      return {
        ok: false,
        status: response.status,
        kind: mapMutationError(response.status),
        message: readErrorMessage(data, response.status, "Failed to remove avatar"),
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    }

    return {
      ok: true,
      avatarUrl: normalizeAvatarUrl(data.avatar_url),
    };
  } catch (err) {
    log.warn("Failed to remove own avatar", { error: String(err) });
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: String(err),
    };
  }
}
