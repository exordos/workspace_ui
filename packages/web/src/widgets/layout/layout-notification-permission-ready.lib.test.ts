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
        workspaceScopeKey:
          "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a",
        workspaceMessengerActive: true,
      }),
    ).toBe(true);
  });

  it("keeps the legacy route disabled", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        workspaceScopeKey: null,
        workspaceMessengerActive: false,
      }),
    ).toBe(false);

    expect(
      shouldEnableLayoutNotificationPermission({
        workspaceScopeKey:
          "account:account-a:instance:instance-a:organization:org-1:project:project-a:user:user-a",
        workspaceMessengerActive: false,
      }),
    ).toBe(false);
  });

  it("stays disabled until an organization is selected", () => {
    expect(
      shouldEnableLayoutNotificationPermission({
        workspaceScopeKey: null,
        workspaceMessengerActive: true,
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
