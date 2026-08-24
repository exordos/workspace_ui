import { describe, expect, it } from "vitest";
import {
  isWorkspaceStreamFullyMuted,
  mapTopicVisibilityLevelToWorkspaceMode,
  mapWorkspaceTopicNotificationModeToLevel,
  resolveWorkspaceDisplayedUnread,
} from "./messenger-notification-mode.lib";

describe("Workspace notification projections", () => {
  it("keeps a muted stream active when a topic explicitly overrides notifications", () => {
    expect(isWorkspaceStreamFullyMuted("muted", ["default", "mute"])).toBe(true);
    expect(isWorkspaceStreamFullyMuted("muted", ["default", "unmute"])).toBe(false);
    expect(isWorkspaceStreamFullyMuted("muted", ["follow"])).toBe(false);
  });

  it("uses active unread first, then passive unread, then hides the badge", () => {
    expect(
      resolveWorkspaceDisplayedUnread({
        unreadCount: 9,
        activeUnreadCount: 3,
        passiveUnreadCount: 6,
      }),
    ).toEqual({ count: 3, passive: false });
    expect(
      resolveWorkspaceDisplayedUnread({
        unreadCount: 6,
        activeUnreadCount: 0,
        passiveUnreadCount: 6,
      }),
    ).toEqual({ count: 6, passive: true });
    expect(
      resolveWorkspaceDisplayedUnread({
        unreadCount: 0,
        activeUnreadCount: 0,
        passiveUnreadCount: 0,
      }),
    ).toBeNull();
  });

  it("maps topic notification modes through the shared visibility levels", () => {
    expect(mapWorkspaceTopicNotificationModeToLevel("default")).toBe("inherit");
    expect(mapWorkspaceTopicNotificationModeToLevel("mute")).toBe("muted");
    expect(mapWorkspaceTopicNotificationModeToLevel("unmute")).toBe("unmuted");
    expect(mapWorkspaceTopicNotificationModeToLevel("follow")).toBe("followed");

    expect(mapTopicVisibilityLevelToWorkspaceMode("inherit")).toBe("default");
    expect(mapTopicVisibilityLevelToWorkspaceMode("muted")).toBe("mute");
    expect(mapTopicVisibilityLevelToWorkspaceMode("unmuted")).toBe("unmute");
    expect(mapTopicVisibilityLevelToWorkspaceMode("followed")).toBe("follow");
  });
});
