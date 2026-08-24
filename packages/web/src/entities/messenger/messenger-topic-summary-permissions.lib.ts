import type { MessengerStream, MessengerUuid } from "./messenger.types";

export const TOPIC_SUMMARY_SETTINGS_MANAGE_PERMISSION = "workspace.topic_summary_settings.manage";
export const TOPIC_SUMMARY_ENDPOINT_MANAGE_PERMISSION = "workspace.topic_summary_endpoint.manage";

export type MessengerTopicSummaryPermission = "unknown" | "allowed" | "denied";

export interface MessengerTopicSummaryPermissionResolution {
  topic: MessengerTopicSummaryPermission;
  gates: MessengerTopicSummaryPermission;
  endpoints: MessengerTopicSummaryPermission;
  isGearVisible: boolean;
}

export interface ResolveMessengerTopicSummaryPermissionsInput {
  currentUserUuid?: MessengerUuid | null;
  stream?: Pick<MessengerStream, "role" | "userUuid"> | null;
  capabilities?: readonly string[] | null;
}

function resolveTopicPermission(
  currentUserUuid: MessengerUuid | null | undefined,
  stream: ResolveMessengerTopicSummaryPermissionsInput["stream"],
): MessengerTopicSummaryPermission {
  const currentUserValue = currentUserUuid ?? "";
  const normalizedCurrentUserUuid = currentUserValue.trim();
  if (
    normalizedCurrentUserUuid.length === 0 ||
    normalizedCurrentUserUuid !== currentUserValue ||
    stream == null
  ) {
    return "unknown";
  }

  // A stream snapshot is user-scoped. Do not trust a role from another account's stale snapshot.
  if (stream.userUuid !== normalizedCurrentUserUuid) return "unknown";
  if (stream.role === "owner" || stream.role === "administrator") {
    return "allowed";
  }

  return "denied";
}

function resolveCapabilityPermission(
  capabilities: readonly string[] | null | undefined,
  requiredCapability: string,
): MessengerTopicSummaryPermission {
  if (capabilities == null) return "unknown";
  return capabilities.includes(requiredCapability) ? "allowed" : "denied";
}

export function resolveMessengerTopicSummaryPermissions(
  input: ResolveMessengerTopicSummaryPermissionsInput,
): MessengerTopicSummaryPermissionResolution {
  const topic = resolveTopicPermission(input.currentUserUuid, input.stream);
  const gates = resolveCapabilityPermission(
    input.capabilities,
    TOPIC_SUMMARY_SETTINGS_MANAGE_PERMISSION,
  );
  const endpoints = resolveCapabilityPermission(
    input.capabilities,
    TOPIC_SUMMARY_ENDPOINT_MANAGE_PERMISSION,
  );

  return {
    topic,
    gates,
    endpoints,
    isGearVisible: topic === "allowed" || gates === "allowed" || endpoints === "allowed",
  };
}
