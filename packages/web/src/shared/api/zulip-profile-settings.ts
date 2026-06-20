import { createLogger } from "~/shared/lib/logger";
import {
  getCurrentInstance,
  refreshWorkspaceApiBase,
  refreshZulipApiBase,
  zulipApi,
} from "./client";

const log = createLogger("zulip-profile-settings");

interface ProfileSettingsResponsePayload {
  result?: string;
  msg?: string;
  code?: string;
  ignored_parameters_unsupported?: unknown;
}

export interface UpdateOwnProfileSettingsParams {
  fullName: string;
  timezone: string;
}

export type ProfileSettingsMutationErrorKind =
  | "forbidden"
  | "invalid"
  | "unsupported"
  | "transient";

export type ProfileSettingsMutationResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      kind: ProfileSettingsMutationErrorKind;
      message: string;
      code?: string;
    };

function mapMutationError(status: number): ProfileSettingsMutationErrorKind {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid";
  if (status === 404 || status === 405) return "unsupported";
  return "transient";
}

function readErrorMessage(
  data: ProfileSettingsResponsePayload,
  status: number,
  fallback: string,
): string {
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

function includesUnsupportedTimezoneField(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => entry === "timezone");
}

export async function updateOwnProfileSettings(
  params: UpdateOwnProfileSettingsParams,
): Promise<ProfileSettingsMutationResult> {
  if (getCurrentInstance() == null) {
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: "No active instance",
    };
  }

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();

    const response = await zulipApi.patch("/settings", {
      full_name: params.fullName,
      timezone: params.timezone,
    });
    const data = (response.data ?? {}) as ProfileSettingsResponsePayload;

    if (!response.ok || data.result === "error") {
      return {
        ok: false,
        status: response.status,
        kind: mapMutationError(response.status),
        message: readErrorMessage(data, response.status, "Failed to update profile settings"),
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    }

    if (includesUnsupportedTimezoneField(data.ignored_parameters_unsupported)) {
      return {
        ok: false,
        status: response.status,
        kind: "unsupported",
        message: "Timezone setting is not supported by this server",
      };
    }

    return { ok: true };
  } catch (err) {
    log.warn("Failed to update own profile settings", { error: String(err) });
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: String(err),
    };
  }
}
