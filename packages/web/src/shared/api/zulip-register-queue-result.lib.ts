import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import { extractUserSettingsFromRegisterData } from "~/shared/lib/zulip-notification-settings.lib";
import { parseSubscriptions } from "./zulip-queue-parse-subscription.lib";
import { parseRecentPrivateConversations } from "./zulip-recent-private-conversations.lib";
import { parseRegisterResponseJitsiServerUrl } from "./zulip-register-jitsi.lib";
import {
  parseAvatarChangesDisabledFlag,
  parseMaxAvatarFileSizeMib,
  parseServerThumbnailFormats,
} from "./zulip-register-metadata.lib";
import { parseRegisterUnreadSnapshot } from "./zulip-unread.lib";
import { parseUserTopics } from "./zulip-user-topics.internal";
import type {
  RegisterQueueResult,
  ZulipOwnAvatarCapabilities,
  ZulipRealmUserGroup,
  ZulipSubscription,
  ZulipUserTopic,
} from "./zulip.types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseRealmUserGroups(data: unknown): ZulipRealmUserGroup[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const parsed: ZulipRealmUserGroup[] = [];
  for (const row of data) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const record = row as Record<string, unknown>;
    const id = record.id;
    const name = record.name;
    if (!isPositiveInteger(id) || typeof name !== "string") {
      continue;
    }
    const members = Array.isArray(record.members)
      ? Array.from(new Set(record.members.filter(isPositiveInteger))).sort(
          (left, right) => left - right,
        )
      : [];
    const directSubgroupIds = Array.isArray(record.direct_subgroup_ids)
      ? Array.from(new Set(record.direct_subgroup_ids.filter(isPositiveInteger))).sort(
          (left, right) => left - right,
        )
      : [];
    parsed.push({
      id,
      name,
      members,
      direct_subgroup_ids: directSubgroupIds,
      ...(typeof record.is_system_group === "boolean"
        ? { is_system_group: record.is_system_group }
        : {}),
    });
  }
  return parsed;
}

export interface RegisterQueueRawData {
  queue_id?: string;
  last_event_id?: number;
  event_queue_longpoll_timeout_seconds?: number;
  subscriptions?: unknown;
  user_topics?: unknown;
  recent_private_conversations?: unknown;
  realm_can_add_subscribers_group?: unknown;
  realm_can_resolve_topics_group?: unknown;
  realm_user_groups?: unknown;
  server_thumbnail_formats?: unknown;
  max_avatar_file_size_mib?: unknown;
  realm_avatar_changes_disabled?: unknown;
  server_avatar_changes_disabled?: unknown;
  user_settings?: unknown;
  unread_msgs?: unknown;
}

export interface RegisterQueueParsedMetadata {
  unreadSnapshot: ReturnType<typeof parseRegisterUnreadSnapshot>;
  userSettings: ReturnType<typeof extractUserSettingsFromRegisterData>;
  subscriptions: ZulipSubscription[] | null;
  userTopics: ZulipUserTopic[] | null;
  recentPrivateConversations: ReturnType<typeof parseRecentPrivateConversations>;
  realmCanAddSubscribersGroup: ReturnType<typeof normalizeGroupSettingValue>;
  realmCanResolveTopicsGroup: ReturnType<typeof normalizeGroupSettingValue>;
  realmUserGroups: ZulipRealmUserGroup[] | null;
  serverThumbnailFormats: ReturnType<typeof parseServerThumbnailFormats>;
  maxAvatarFileSizeMib: ReturnType<typeof parseMaxAvatarFileSizeMib>;
  realmAvatarChangesDisabled: ReturnType<typeof parseAvatarChangesDisabledFlag>;
  serverAvatarChangesDisabled: ReturnType<typeof parseAvatarChangesDisabledFlag>;
  jitsiServerUrlEffective: ReturnType<typeof parseRegisterResponseJitsiServerUrl>;
}

export function parseRegisterQueueMetadata(
  data: RegisterQueueRawData,
): RegisterQueueParsedMetadata {
  return {
    unreadSnapshot: parseRegisterUnreadSnapshot(data),
    userSettings: extractUserSettingsFromRegisterData(data as Record<string, unknown>),
    subscriptions: parseSubscriptions(data.subscriptions),
    userTopics: parseUserTopics(data.user_topics),
    recentPrivateConversations: parseRecentPrivateConversations(data.recent_private_conversations),
    realmCanAddSubscribersGroup: normalizeGroupSettingValue(data.realm_can_add_subscribers_group),
    realmCanResolveTopicsGroup: normalizeGroupSettingValue(data.realm_can_resolve_topics_group),
    realmUserGroups: parseRealmUserGroups(data.realm_user_groups),
    serverThumbnailFormats: parseServerThumbnailFormats(data.server_thumbnail_formats),
    maxAvatarFileSizeMib: parseMaxAvatarFileSizeMib(data.max_avatar_file_size_mib),
    realmAvatarChangesDisabled: parseAvatarChangesDisabledFlag(data.realm_avatar_changes_disabled),
    serverAvatarChangesDisabled: parseAvatarChangesDisabledFlag(
      data.server_avatar_changes_disabled,
    ),
    jitsiServerUrlEffective: parseRegisterResponseJitsiServerUrl(data),
  };
}

export function toOwnAvatarCapabilities(
  metadata: RegisterQueueParsedMetadata,
): ZulipOwnAvatarCapabilities {
  return {
    ...(metadata.maxAvatarFileSizeMib != null
      ? { max_avatar_file_size_mib: metadata.maxAvatarFileSizeMib }
      : {}),
    ...(metadata.realmAvatarChangesDisabled != null
      ? { realm_avatar_changes_disabled: metadata.realmAvatarChangesDisabled }
      : {}),
    ...(metadata.serverAvatarChangesDisabled != null
      ? { server_avatar_changes_disabled: metadata.serverAvatarChangesDisabled }
      : {}),
  };
}

export function buildRegisterQueueResult(
  data: RegisterQueueRawData & { queue_id: string; last_event_id: number },
  metadata: RegisterQueueParsedMetadata,
): RegisterQueueResult {
  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(metadata.subscriptions ? { subscriptions: metadata.subscriptions } : {}),
    ...(metadata.userTopics ? { user_topics: metadata.userTopics } : {}),
    ...(metadata.recentPrivateConversations
      ? { recent_private_conversations: metadata.recentPrivateConversations }
      : {}),
    ...(metadata.realmCanAddSubscribersGroup != null
      ? { realm_can_add_subscribers_group: metadata.realmCanAddSubscribersGroup }
      : {}),
    ...(metadata.realmCanResolveTopicsGroup != null
      ? { realm_can_resolve_topics_group: metadata.realmCanResolveTopicsGroup }
      : {}),
    ...(metadata.realmUserGroups ? { realm_user_groups: metadata.realmUserGroups } : {}),
    ...(metadata.serverThumbnailFormats
      ? { server_thumbnail_formats: metadata.serverThumbnailFormats }
      : {}),
    ...(metadata.maxAvatarFileSizeMib != null
      ? { max_avatar_file_size_mib: metadata.maxAvatarFileSizeMib }
      : {}),
    ...(metadata.realmAvatarChangesDisabled != null
      ? { realm_avatar_changes_disabled: metadata.realmAvatarChangesDisabled }
      : {}),
    ...(metadata.serverAvatarChangesDisabled != null
      ? { server_avatar_changes_disabled: metadata.serverAvatarChangesDisabled }
      : {}),
    ...(metadata.jitsiServerUrlEffective
      ? { jitsi_server_url_effective: metadata.jitsiServerUrlEffective }
      : {}),
    ...(metadata.userSettings ? { user_settings: metadata.userSettings } : {}),
    ...(metadata.unreadSnapshot ? { unread_snapshot: metadata.unreadSnapshot } : {}),
  };
}
