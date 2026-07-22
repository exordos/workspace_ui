import { describe, expect, it } from "vitest";
import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import {
  adaptWorkspaceExternalAccountDto,
  isExternalAccountDuplicate,
} from "./external-account-adapters.lib";

const dto: WorkspaceExternalAccountDto = {
  uuid: "account-1",
  settings: {
    kind: "zulip",
    server_url: "https://zulip.example.com",
    email: "user@example.com",
    selection_mode: "explicit",
    history_depth: "30_days",
    default_project_id: "project-1",
  },
  credential_present: true,
  status: "live",
  live_ready: true,
  capabilities: {},
  safe_error: null,
  desired_generation: 3,
  applied_generation: 3,
  last_progress_at: "2026-07-10T09:00:00Z",
  revision: 2,
  created_at: "2026-07-10T08:00:00Z",
  updated_at: "2026-07-10T09:00:00Z",
};

describe("external account adapters", () => {
  it("maps server fields and excludes credentials from the domain object", () => {
    const account = adaptWorkspaceExternalAccountDto(dto);

    expect(account).toEqual({
      uuid: "account-1",
      serverUrl: "https://zulip.example.com",
      email: "user@example.com",
      accountType: "zulip",
      selectionMode: "explicit",
      historyDepth: "30_days",
      defaultProjectId: "project-1",
      credentialPresent: true,
      status: "live",
      liveReady: true,
      capabilities: {},
      safeError: null,
      desiredGeneration: 3,
      appliedGeneration: 3,
      lastProgressAt: "2026-07-10T09:00:00Z",
      revision: 2,
      createdAt: "2026-07-10T08:00:00Z",
      updatedAt: "2026-07-10T09:00:00Z",
    });
    expect(account).not.toHaveProperty("apiKey");
  });

  it("detects the backend duplicate rule by account type", () => {
    const account = adaptWorkspaceExternalAccountDto(dto);
    expect(isExternalAccountDuplicate([account], "zulip")).toBe(true);
  });
});
