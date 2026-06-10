import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import type { ZulipSubscription } from "./zulip.types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === true || value === false) return value;
  if (value === null) return null;
  return undefined;
}

function parseSubscriptionRow(row: unknown): ZulipSubscription | null {
  if (typeof row !== "object" || row == null || Array.isArray(row)) {
    return null;
  }
  const subscription = row as {
    stream_id?: unknown;
    name?: unknown;
    is_muted?: unknown;
    desktop_notifications?: unknown;
    audible_notifications?: unknown;
    is_archived?: unknown;
    in_home_view?: unknown;
    creator_id?: unknown;
    invite_only?: unknown;
    can_add_subscribers_group?: unknown;
    can_remove_subscribers_group?: unknown;
    can_administer_channel_group?: unknown;
    can_resolve_topics_group?: unknown;
    can_move_messages_out_of_channel_group?: unknown;
  };
  if (!isPositiveInteger(subscription.stream_id) || typeof subscription.name !== "string") {
    return null;
  }
  const canAddSubscribersGroup = normalizeGroupSettingValue(subscription.can_add_subscribers_group);
  const canRemoveSubscribersGroup = normalizeGroupSettingValue(
    subscription.can_remove_subscribers_group,
  );
  const canAdministerChannelGroup = normalizeGroupSettingValue(
    subscription.can_administer_channel_group,
  );
  const canResolveTopicsGroup = normalizeGroupSettingValue(subscription.can_resolve_topics_group);
  const canMoveMessagesOutOfChannelGroup = normalizeGroupSettingValue(
    subscription.can_move_messages_out_of_channel_group,
  );
  return {
    stream_id: subscription.stream_id,
    name: subscription.name,
    is_muted:
      typeof subscription.is_muted === "boolean"
        ? subscription.is_muted
        : subscription.in_home_view === false,
    ...(() => {
      const desktop = parseNullableBoolean(subscription.desktop_notifications);
      return desktop !== undefined ? { desktop_notifications: desktop } : {};
    })(),
    ...(() => {
      const audible = parseNullableBoolean(subscription.audible_notifications);
      return audible !== undefined ? { audible_notifications: audible } : {};
    })(),
    ...(typeof subscription.is_archived === "boolean"
      ? { is_archived: subscription.is_archived }
      : {}),
    ...(isPositiveInteger(subscription.creator_id) ? { creator_id: subscription.creator_id } : {}),
    ...(typeof subscription.invite_only === "boolean"
      ? { invite_only: subscription.invite_only }
      : {}),
    ...(canAddSubscribersGroup != null
      ? { can_add_subscribers_group: canAddSubscribersGroup }
      : {}),
    ...(canRemoveSubscribersGroup != null
      ? { can_remove_subscribers_group: canRemoveSubscribersGroup }
      : {}),
    ...(canAdministerChannelGroup != null
      ? { can_administer_channel_group: canAdministerChannelGroup }
      : {}),
    ...(canResolveTopicsGroup != null ? { can_resolve_topics_group: canResolveTopicsGroup } : {}),
    ...(canMoveMessagesOutOfChannelGroup != null
      ? { can_move_messages_out_of_channel_group: canMoveMessagesOutOfChannelGroup }
      : {}),
  };
}

/** Normalizes subscription list from register response. */
export function parseSubscriptions(data: unknown): ZulipSubscription[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const parsed: ZulipSubscription[] = [];
  for (const row of data) {
    const subscription = parseSubscriptionRow(row);
    if (subscription) {
      parsed.push(subscription);
    }
  }
  return parsed;
}
