import { beforeEach, describe, expect, it } from "vitest";
import {
  buildWorkspaceNotificationDedupKey,
  clearNotifiedMessageIds,
  registerNotifiedWorkspaceMessage,
  wasWorkspaceMessageRecentlyNotified,
} from "./notification-dedup.lib";

beforeEach(() => {
  clearNotifiedMessageIds();
});

describe("notification dedup", () => {
  it("builds workspace dedup key from ownerKey and messageUuid", () => {
    expect(buildWorkspaceNotificationDedupKey("owner-1", "msg-1")).toBe("owner-1::msg-1");
    expect(buildWorkspaceNotificationDedupKey("owner-1", "   ")).toBeNull();
    expect(buildWorkspaceNotificationDedupKey("", "msg-1")).toBeNull();
  });

  it("deduplicates only inside the same owner scope", () => {
    registerNotifiedWorkspaceMessage("owner-1", "shared-uuid");

    expect(wasWorkspaceMessageRecentlyNotified("owner-1", "shared-uuid")).toBe(true);
    expect(wasWorkspaceMessageRecentlyNotified("owner-2", "shared-uuid")).toBe(false);

    registerNotifiedWorkspaceMessage("owner-2", "shared-uuid");

    expect(wasWorkspaceMessageRecentlyNotified("owner-2", "shared-uuid")).toBe(true);
  });

  it("does not deduplicate a different message UUID inside the same owner scope", () => {
    registerNotifiedWorkspaceMessage("owner-1", "msg-42");

    expect(wasWorkspaceMessageRecentlyNotified("owner-1", "msg-42")).toBe(true);
    expect(wasWorkspaceMessageRecentlyNotified("owner-1", "msg-43")).toBe(false);
  });
});
