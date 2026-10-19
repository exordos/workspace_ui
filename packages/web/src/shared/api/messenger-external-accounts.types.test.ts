import { describe, expect, it } from "vitest";
import { isWorkspaceExternalAccountDto } from "./messenger-external-accounts.types";

const currentDto = {
  uuid: "account-uuid",
  settings: {
    kind: "zulip",
    server_url: "https://zulip.example.com",
    email: "user@example.com",
    selection_mode: "explicit",
    history_depth: "30_days",
    default_project_id: "project-uuid",
  },
  credential_present: true,
  status: "connecting",
  live_ready: false,
  capabilities: {},
  safe_error: null,
  desired_generation: 1,
  applied_generation: 0,
  last_progress_at: null,
  revision: 1,
  created_at: "2026-07-10T08:00:00Z",
  updated_at: "2026-07-10T08:00:00Z",
};

describe("external account DTO guard", () => {
  it.each(["new", "backfill", "fast_backfill", "active", "error"])(
    "accepts a saved registry model with status %s without processing metadata",
    (status) => {
      expect(
        isWorkspaceExternalAccountDto({
          uuid: currentDto.uuid,
          provider: "zulip",
          settings: currentDto.settings,
          status,
          error_description: null,
          created_at: currentDto.created_at,
          updated_at: currentDto.updated_at,
        }),
      ).toBe(true);
    },
  );
  it("accepts the current sanitized contract", () => {
    expect(isWorkspaceExternalAccountDto(currentDto)).toBe(true);
  });

  it("rejects the legacy account contract", () => {
    expect(
      isWorkspaceExternalAccountDto({
        uuid: "account-uuid",
        account_type: "zulip",
        status: "active",
        access_status: "confirmed",
        account_settings: { kind: "zulip" },
      }),
    ).toBe(false);
  });

  it("rejects credential leakage in place of sanitized settings", () => {
    expect(
      isWorkspaceExternalAccountDto({
        ...currentDto,
        settings: { ...currentDto.settings, selection_mode: "automatic" },
      }),
    ).toBe(false);
  });
});
