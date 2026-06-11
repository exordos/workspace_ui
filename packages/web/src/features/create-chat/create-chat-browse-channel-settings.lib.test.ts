import { describe, expect, it } from "vitest";
import {
  buildBrowseChannelDetailSections,
  createBrowseChannelDetailLabels,
  resolveBrowseChannelTypeKey,
} from "./create-chat-browse-channel-settings.lib";

const labels = createBrowseChannelDetailLabels({
  t: (key, params) => {
    if (key === "channel.browseDirectMembers" && params?.count != null) {
      return `${params.count} users`;
    }
    if (key === "channel.browseUserId" && params?.id != null) {
      return `User #${params.id}`;
    }
    if (key === "channel.browseRetentionDays" && params?.count != null) {
      return `${params.count} days`;
    }
    const map: Record<string, string> = {
      "channel.typeOpen": "Open",
      "channel.typeClosed": "Closed, open history",
      "channel.typeClosedProtected": "Closed, protected history",
      "channel.announcementOnly": "Announcement-only channel",
      "channel.webPublic": "Public on the web",
      "channel.subscribed": "Subscribed",
      "channel.browseNotSubscribed": "Not subscribed",
      "channel.notificationMuted": "Muted",
      "channel.notificationDefault": "Mentions only",
      "channel.postingPolicyEveryone": "Everyone can post",
      "channel.browseStatUnknown": "Unknown",
      "channel.browseNoFolder": "No folder",
      "channel.browseRetentionRealmDefault": "Organization default",
      "channel.browseYes": "Yes",
      "channel.browseNo": "No",
      "channel.browseUnknownGroup": "Group",
      "channel.browseNotificationOn": "On",
      "channel.browseNotificationOff": "Off",
      "channel.browseNotificationInherit": "Inherit",
    };
    return map[key] ?? key;
  },
  locale: "en",
  resolveUserName: (id) => (id === 7 ? "Alice" : undefined),
  resolveGroupName: (id) => (id === 9 ? "Administrators" : undefined),
});

describe("create-chat-browse-channel-settings.lib", () => {
  it("resolveBrowseChannelTypeKey maps visibility variants", () => {
    expect(
      resolveBrowseChannelTypeKey({
        inviteOnly: false,
        historyPublicToSubscribers: null,
      }),
    ).toBe("channel.typeOpen");
  });

  it("buildBrowseChannelDetailSections includes permissions and creator", () => {
    const sections = buildBrowseChannelDetailSections(
      {
        streamId: 42,
        inviteOnly: false,
        historyPublicToSubscribers: true,
        isAnnouncementOnly: false,
        isWebPublic: false,
        streamPostPolicy: 1,
        isSubscribed: true,
        isMuted: false,
        subscriberCount: 15,
        weeklyMessageCount: 30,
        creatorId: 7,
        dateCreated: 1_710_000_000,
        folderId: null,
        isDefault: false,
        isRecentlyActive: true,
        messageRetentionDays: null,
        desktopNotifications: null,
        audibleNotifications: true,
        canSubscribeGroup: 9,
        canAddSubscribersGroup: 9,
      },
      labels,
    );

    const general = sections.find((section) => section.titleKey === "channel.browseSectionGeneral");
    expect(general?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "creator", value: "Alice" }),
        expect.objectContaining({ id: "stream-id", value: "42" }),
      ]),
    );

    const permissions = sections.find(
      (section) => section.titleKey === "channel.browseSectionPermissions",
    );
    expect(permissions?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "can-subscribe", value: "Administrators" }),
      ]),
    );

    const personal = sections.find(
      (section) => section.titleKey === "channel.browseSectionPersonal",
    );
    expect(personal?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "audible-notifications", value: "On" }),
      ]),
    );
  });
});
