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
  capabilities: { chat_catalog: true },
  safe_error: null,
  desired_generation: 3,
  applied_generation: 3,
  last_progress_at: "2026-07-10T09:00:00Z",
  revision: 4,
  created_at: "2026-07-10T08:00:00Z",
  updated_at: "2026-07-10T09:00:00Z",
};

describe("external account adapters", () => {
  it("maps the sanitized snapshot and derives a strong ETag", () => {
    expect(adaptWorkspaceExternalAccountDto(dto)).toEqual({
      uuid: "account-1",
      provider: "zulip",
      settings: {
        kind: "zulip",
        serverUrl: "https://zulip.example.com",
        email: "user@example.com",
        selectionMode: "explicit",
        historyDepth: "30_days",
        defaultProjectId: "project-1",
      },
      credentialPresent: true,
      status: "live",
      liveReady: true,
      capabilities: { chat_catalog: true },
      safeError: null,
      desiredGeneration: 3,
      appliedGeneration: 3,
      lastProgressAt: "2026-07-10T09:00:00Z",
      revision: 4,
      createdAt: "2026-07-10T08:00:00Z",
      updatedAt: "2026-07-10T09:00:00Z",
      etag: '"4"',
    });
  });

  it("uses the provider for duplicate detection", () => {
    const account = adaptWorkspaceExternalAccountDto(dto);
    expect(isExternalAccountDuplicate([account], "zulip")).toBe(true);
  });
});
