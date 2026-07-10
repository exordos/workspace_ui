import { describe, expect, it } from "vitest";
import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import {
  adaptWorkspaceExternalAccountDto,
  isExternalAccountDuplicate,
} from "./external-account-adapters.lib";

const dto: WorkspaceExternalAccountDto = {
  uuid: "account-1",
  project_id: "project-1",
  user_uuid: "user-1",
  server_url: "https://zulip.example.com",
  source_scope: "https://zulip.example.com",
  account_type: "zulip",
  status: "active",
  access_status: "confirmed",
  access_checked_at: "2026-07-10T09:00:00Z",
  access_confirmed_at: "2026-07-10T09:00:00Z",
  access_next_check_at: "2026-07-10T10:00:00Z",
  access_last_error: null,
  account_settings: {
    kind: "zulip",
    credentials: { kind: "zulip", login: "user@example.com", token: "fixture-token" },
    user_info: { user_id: 7 },
  },
  created_at: "2026-07-10T08:00:00Z",
  updated_at: "2026-07-10T09:00:00Z",
};

describe("external account adapters", () => {
  it("maps server fields and excludes credentials from the domain object", () => {
    const account = adaptWorkspaceExternalAccountDto(dto);

    expect(account).toEqual({
      uuid: "account-1",
      projectId: "project-1",
      userUuid: "user-1",
      serverUrl: "https://zulip.example.com",
      sourceScope: "https://zulip.example.com",
      accountType: "zulip",
      status: "active",
      accessStatus: "confirmed",
      accessCheckedAt: "2026-07-10T09:00:00Z",
      accessConfirmedAt: "2026-07-10T09:00:00Z",
      accessNextCheckAt: "2026-07-10T10:00:00Z",
      accessLastError: null,
      accountSettingsKind: "zulip",
      createdAt: "2026-07-10T08:00:00Z",
      updatedAt: "2026-07-10T09:00:00Z",
    });
    expect(account).not.toHaveProperty("credentials");
    expect(account).not.toHaveProperty("userInfo");
  });

  it("detects the backend duplicate rule by account type", () => {
    const account = adaptWorkspaceExternalAccountDto(dto);
    expect(isExternalAccountDuplicate([account], "zulip")).toBe(true);
    expect(isExternalAccountDuplicate([account], "iam")).toBe(false);
  });
});
