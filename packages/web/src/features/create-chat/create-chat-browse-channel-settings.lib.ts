/**
 * Channel metadata sections for the browse-channels detail panel.
 */
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { formatGroupSettingDisplay } from "~/shared/lib/zulip-group-setting-display.lib";

export interface BrowseChannelDetailInput {
  streamId: number;
  inviteOnly: boolean | null;
  historyPublicToSubscribers: boolean | null;
  isAnnouncementOnly: boolean;
  isWebPublic: boolean;
  streamPostPolicy: number | null;
  isSubscribed: boolean;
  isMuted: boolean;
  subscriberCount: number | null;
  weeklyMessageCount: number | null;
  creatorId: number | null;
  dateCreated: number | null;
  folderId: number | null;
  isDefault: boolean | null;
  isRecentlyActive: boolean | null;
  messageRetentionDays: number | null;
  desktopNotifications: boolean | null;
  audibleNotifications: boolean | null;
  canSubscribeGroup?: ZulipGroupSettingValue;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canResolveTopicsGroup?: ZulipGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: ZulipGroupSettingValue;
}

export interface BrowseChannelDetailField {
  id: string;
  labelKey: string;
  value: string;
}

export interface BrowseChannelDetailSection {
  titleKey: string;
  fields: BrowseChannelDetailField[];
}

export interface BrowseChannelDetailLabels {
  resolveChannelType: (input: BrowseChannelDetailInput) => string;
  resolvePostingPolicy: (
    streamPostPolicy: number | null,
    isAnnouncementOnly: boolean,
  ) => string | null;
  resolveBoolean: (value: boolean) => string;
  resolveCreator: (creatorId: number | null) => string | null;
  resolveDate: (unixSeconds: number) => string;
  resolveFolder: (folderId: number | null) => string | null;
  resolveRetention: (days: number | null) => string | null;
  resolveSubscription: (isSubscribed: boolean) => string;
  resolveNotifications: (isMuted: boolean) => string;
  resolveNotificationOverride: (value: boolean | null) => string | null;
  resolveCount: (count: number | null, unknownLabel: string) => string;
  resolveGroupSetting: (value: ZulipGroupSettingValue | undefined) => string | null;
  resolveWebPublic: () => string;
  unknownLabel: string;
}

function pushField(
  fields: BrowseChannelDetailField[],
  id: string,
  labelKey: string,
  value: string | null,
): void {
  if (value == null || value.trim().length === 0) {
    return;
  }
  fields.push({ id, labelKey, value });
}

function buildPermissionFields(
  input: BrowseChannelDetailInput,
  labels: BrowseChannelDetailLabels,
): BrowseChannelDetailField[] {
  const fields: BrowseChannelDetailField[] = [];
  pushField(
    fields,
    "can-subscribe",
    "channel.browsePermCanSubscribe",
    labels.resolveGroupSetting(input.canSubscribeGroup),
  );
  pushField(
    fields,
    "can-add-subscribers",
    "channel.browsePermCanAddSubscribers",
    labels.resolveGroupSetting(input.canAddSubscribersGroup),
  );
  pushField(
    fields,
    "can-remove-subscribers",
    "channel.browsePermCanRemoveSubscribers",
    labels.resolveGroupSetting(input.canRemoveSubscribersGroup),
  );
  pushField(
    fields,
    "can-administer",
    "channel.browsePermCanAdminister",
    labels.resolveGroupSetting(input.canAdministerChannelGroup),
  );
  pushField(
    fields,
    "can-resolve-topics",
    "channel.browsePermCanResolveTopics",
    labels.resolveGroupSetting(input.canResolveTopicsGroup),
  );
  pushField(
    fields,
    "can-move-messages",
    "channel.browsePermCanMoveMessages",
    labels.resolveGroupSetting(input.canMoveMessagesOutOfChannelGroup),
  );
  return fields;
}

/** Builds grouped detail sections; omits empty sections. */
export function buildBrowseChannelDetailSections(
  input: BrowseChannelDetailInput,
  labels: BrowseChannelDetailLabels,
): BrowseChannelDetailSection[] {
  const sections: BrowseChannelDetailSection[] = [];

  const generalFields: BrowseChannelDetailField[] = [];
  pushField(generalFields, "stream-id", "channel.browseStreamId", String(input.streamId));
  pushField(generalFields, "type", "channel.type", labels.resolveChannelType(input));
  pushField(
    generalFields,
    "creator",
    "channel.browseCreator",
    labels.resolveCreator(input.creatorId),
  );
  if (input.dateCreated != null) {
    pushField(
      generalFields,
      "created",
      "channel.browseCreated",
      labels.resolveDate(input.dateCreated),
    );
  }
  pushField(generalFields, "folder", "channel.browseFolder", labels.resolveFolder(input.folderId));
  if (input.isDefault != null) {
    pushField(
      generalFields,
      "default",
      "channel.browseDefaultChannel",
      labels.resolveBoolean(input.isDefault),
    );
  }
  if (input.isRecentlyActive != null) {
    pushField(
      generalFields,
      "recently-active",
      "channel.browseRecentlyActive",
      labels.resolveBoolean(input.isRecentlyActive),
    );
  }
  if (generalFields.length > 0) {
    sections.push({ titleKey: "channel.browseSectionGeneral", fields: generalFields });
  }

  const activityFields: BrowseChannelDetailField[] = [];
  pushField(
    activityFields,
    "subscribers",
    "channel.browseStatSubscribers",
    labels.resolveCount(input.subscriberCount, labels.unknownLabel),
  );
  pushField(
    activityFields,
    "weekly-messages",
    "channel.browseStatWeeklyMessages",
    labels.resolveCount(input.weeklyMessageCount, labels.unknownLabel),
  );
  if (activityFields.length > 0) {
    sections.push({ titleKey: "channel.browseSectionActivity", fields: activityFields });
  }

  const accessFields: BrowseChannelDetailField[] = [];
  if (input.historyPublicToSubscribers != null) {
    pushField(
      accessFields,
      "history-public",
      "channel.browseHistoryPublic",
      labels.resolveBoolean(input.historyPublicToSubscribers),
    );
  }
  if (input.isWebPublic) {
    pushField(
      accessFields,
      "web-public",
      "channel.browseSettingVisibility",
      labels.resolveWebPublic(),
    );
  }
  const postingPolicy = labels.resolvePostingPolicy(
    input.streamPostPolicy,
    input.isAnnouncementOnly,
  );
  pushField(accessFields, "posting-policy", "channel.browseSettingPosting", postingPolicy);
  if (accessFields.length > 0) {
    sections.push({ titleKey: "channel.browseSectionAccess", fields: accessFields });
  }

  const permissionFields = buildPermissionFields(input, labels);
  if (permissionFields.length > 0) {
    sections.push({ titleKey: "channel.browseSectionPermissions", fields: permissionFields });
  }

  const retentionValue = labels.resolveRetention(input.messageRetentionDays);
  if (retentionValue != null) {
    sections.push({
      titleKey: "channel.browseSectionRetention",
      fields: [
        {
          id: "retention",
          labelKey: "channel.browseMessageRetention",
          value: retentionValue,
        },
      ],
    });
  }

  const personalFields: BrowseChannelDetailField[] = [];
  pushField(
    personalFields,
    "subscription",
    "channel.browseSettingSubscription",
    labels.resolveSubscription(input.isSubscribed),
  );
  if (input.isSubscribed) {
    pushField(
      personalFields,
      "notifications",
      "channel.notifications",
      labels.resolveNotifications(input.isMuted),
    );
    pushField(
      personalFields,
      "desktop-notifications",
      "channel.browseDesktopNotifications",
      labels.resolveNotificationOverride(input.desktopNotifications),
    );
    pushField(
      personalFields,
      "audible-notifications",
      "channel.browseAudibleNotifications",
      labels.resolveNotificationOverride(input.audibleNotifications),
    );
  }
  if (personalFields.length > 0) {
    sections.push({ titleKey: "channel.browseSectionPersonal", fields: personalFields });
  }

  return sections;
}

/** @deprecated Use buildBrowseChannelDetailSections — kept for legacy tests. */
export function resolveBrowseChannelTypeKey(input: {
  inviteOnly: boolean | null;
  historyPublicToSubscribers: boolean | null;
}): string {
  if (input.inviteOnly !== true) {
    return "channel.typeOpen";
  }
  if (input.historyPublicToSubscribers === false) {
    return "channel.typeClosedProtected";
  }
  return "channel.typeClosed";
}

export function createBrowseChannelDetailLabels(options: {
  t: (key: string, params?: Record<string, string | number>) => string;
  resolveGroupName: (groupId: number) => string | undefined;
  resolveUserName: (userId: number) => string | undefined;
  locale: string;
}): BrowseChannelDetailLabels {
  const { t, resolveGroupName, resolveUserName, locale } = options;
  const formatGroup = (value: ZulipGroupSettingValue | undefined) =>
    formatGroupSettingDisplay(value, {
      resolveGroupName,
      unknownGroupLabel: t("channel.browseUnknownGroup"),
      directMembersLabel: (count) => t("channel.browseDirectMembers", { count }),
    });

  return {
    resolveChannelType: (input) => t(resolveBrowseChannelTypeKey(input)),
    resolvePostingPolicy: (streamPostPolicy, isAnnouncementOnly) => {
      if (isAnnouncementOnly) {
        return t("channel.announcementOnly");
      }
      if (streamPostPolicy == null) {
        return null;
      }
      switch (streamPostPolicy) {
        case 1:
          return t("channel.postingPolicyEveryone");
        case 2:
          return t("channel.postingPolicyAdminsModerators");
        case 3:
          return t("channel.postingPolicyFullMembers");
        case 4:
          return t("channel.postingPolicyChannelAdmins");
        default:
          return null;
      }
    },
    resolveBoolean: (value) => (value ? t("channel.browseYes") : t("channel.browseNo")),
    resolveCreator: (creatorId) => {
      if (creatorId == null) {
        return t("channel.browseStatUnknown");
      }
      return resolveUserName(creatorId) ?? t("channel.browseUserId", { id: creatorId });
    },
    resolveDate: (unixSeconds) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(unixSeconds * 1000)),
    resolveFolder: (folderId) => {
      if (folderId == null) {
        return t("channel.browseNoFolder");
      }
      return t("channel.browseFolderId", { id: folderId });
    },
    resolveRetention: (days) => {
      if (days == null) {
        return t("channel.browseRetentionRealmDefault");
      }
      return t("channel.browseRetentionDays", { count: days });
    },
    resolveSubscription: (isSubscribed) =>
      isSubscribed ? t("channel.subscribed") : t("channel.browseNotSubscribed"),
    resolveNotifications: (isMuted) =>
      isMuted ? t("channel.notificationMuted") : t("channel.notificationDefault"),
    resolveNotificationOverride: (value) => {
      if (value == null) {
        return t("channel.browseNotificationInherit");
      }
      return value ? t("channel.browseNotificationOn") : t("channel.browseNotificationOff");
    },
    resolveCount: (count, unknownLabel) => (count != null ? String(count) : unknownLabel),
    resolveGroupSetting: formatGroup,
    resolveWebPublic: () => t("channel.webPublic"),
    unknownLabel: t("channel.browseStatUnknown"),
  };
}
