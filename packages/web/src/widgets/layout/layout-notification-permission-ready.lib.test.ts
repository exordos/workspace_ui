import { afterEach, describe, expect, it } from "vitest";
import { shouldEnableLayoutNotificationPermission } from "./layout-notification-permission-ready.lib";
import {
  buildNotificationPromptDismissKey,
  readNotificationPromptDismissed,
  writeNotificationPromptDismissed,
} from "./layout-notification-permission.lib";

describe("layout notification permission readiness", () => {
  afterEach(() => {
    for (const scopeKey of [
      "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a",
      "account:account-b:instance:instance-b:organization:org-1:project:project-b:user:user-b",
    ] as const) {
      localStorage.removeItem(buildNotificationPromptDismissKey(scopeKey));
    }
  });

  it("enables the prompt for Workspace routes once a runtime scope is selected", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        legacyOrganizationId: null,
        workspaceScopeKey:
          "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a",
        workspaceMessengerActive: true,
        currentUserStatus: "idle",
      }),
    ).toBe(true);
  });

  it("keeps the legacy route gated by user connection readiness", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        legacyOrganizationId: "org-1",
        workspaceScopeKey: null,
        workspaceMessengerActive: false,
        currentUserStatus: "idle",
      }),
    ).toBe(false);

    expect(
      shouldEnableLayoutNotificationPermission({
        legacyOrganizationId: "org-1",
        workspaceScopeKey: null,
        workspaceMessengerActive: false,
        currentUserStatus: "ready",
      }),
    ).toBe(true);
  });

  it("stays disabled until an organization is selected", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        legacyOrganizationId: "legacy-org",
        workspaceScopeKey: null,
        workspaceMessengerActive: true,
        currentUserStatus: "ready",
      }),
    ).toBe(false);
  });

  it("keeps legacy routes disabled without the legacy organization", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        legacyOrganizationId: null,
        workspaceScopeKey:
          "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a",
        workspaceMessengerActive: false,
        currentUserStatus: "ready",
      }),
    ).toBe(false);
  });

  it("keeps dismissed Workspace prompts scoped by runtime owner key", () => {
    const firstScopeKey =
      "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a";
    const secondScopeKey =
      "account:account-b:instance:instance-b:organization:org-1:project:project-b:user:user-b";

    writeNotificationPromptDismissed(firstScopeKey);

    expect(readNotificationPromptDismissed(firstScopeKey)).toBe(true);
    expect(readNotificationPromptDismissed(secondScopeKey)).toBe(false);
  });
});
