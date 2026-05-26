import { afterEach, describe, expect, it } from "vitest";
import {
  buildNotificationPromptDismissKey,
  readNotificationPromptDismissed,
  shouldShowNotificationPermissionBanner,
  writeNotificationPromptDismissed,
} from "./layout-notification-permission.lib";

describe("layout-notification-permission.lib", () => {
  afterEach(() => {
    for (const orgId of ["org-1", "org-2", "default"] as const) {
      localStorage.removeItem(buildNotificationPromptDismissKey(orgId));
    }
  });

  it("shows banner when permission is default and not dismissed", () => {
    expect(
      shouldShowNotificationPermissionBanner({
        enabled: true,
        permission: "default",
        dismissed: false,
        notificationsSupported: true,
      }),
    ).toBe(true);
  });

  it("hides banner when dismissed or already granted", () => {
    expect(
      shouldShowNotificationPermissionBanner({
        enabled: true,
        permission: "default",
        dismissed: true,
        notificationsSupported: true,
      }),
    ).toBe(false);
    expect(
      shouldShowNotificationPermissionBanner({
        enabled: true,
        permission: "granted",
        dismissed: false,
        notificationsSupported: true,
      }),
    ).toBe(false);
  });

  it("persists dismiss per organization", () => {
    const key = buildNotificationPromptDismissKey("org-1");
    expect(readNotificationPromptDismissed("org-1")).toBe(false);
    writeNotificationPromptDismissed("org-1");
    expect(localStorage.getItem(key)).toBe("1");
    expect(readNotificationPromptDismissed("org-1")).toBe(true);
    expect(readNotificationPromptDismissed("org-2")).toBe(false);
  });
});
