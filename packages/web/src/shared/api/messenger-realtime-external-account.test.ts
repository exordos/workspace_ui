import { describe, expect, it } from "vitest";
import { normalizeWorkspaceRestEvent } from "./messenger-realtime.api";
import {
  isWorkspaceMessengerEventDto,
  type WorkspaceMessengerExternalAccountEventPayloadDto,
  type WorkspaceMessengerEventDto,
} from "./messenger.types";

const ACCOUNT_UUID = "10000000-0000-4000-8000-000000000001";
const PROJECT_UUID = "20000000-0000-4000-8000-000000000002";
const USER_UUID = "30000000-0000-4000-8000-000000000003";

function accountSnapshot(revision = 3) {
  return {
    uuid: ACCOUNT_UUID,
    settings: {
      kind: "zulip" as const,
      server_url: "https://zulip.example.com",
      email: "user@example.com",
      selection_mode: "explicit" as const,
      history_depth: "30_days" as const,
      default_project_id: PROJECT_UUID,
    },
    credential_present: true,
    status: "live" as const,
    live_ready: true,
    capabilities: {},
    safe_error: null,
    desired_generation: 2,
    applied_generation: 2,
    last_progress_at: "2026-07-23T10:00:00Z",
    revision,
    created_at: "2026-07-23T09:00:00Z",
    updated_at: "2026-07-23T10:00:00Z",
  };
}

function externalAccountEvent(
  kind: "external_account.created" | "external_account.updated" | "external_account.deleted",
): WorkspaceMessengerEventDto {
  const action = kind.split(".")[1] as "created" | "updated" | "deleted";
  return {
    schema_version: 1,
    epoch_version: 42,
    uuid: "40000000-0000-4000-8000-000000000004",
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "external_account",
    action,
    payload: {
      kind,
      uuid: ACCOUNT_UUID,
      snapshot: accountSnapshot(),
    },
    created_at: "2026-07-23T10:00:00Z",
    updated_at: "2026-07-23T10:00:00Z",
  };
}

describe("external account realtime transport", () => {
  it.each([
    "external_account.created",
    "external_account.updated",
    "external_account.deleted",
  ] as const)("validates and normalizes the full %s snapshot", (kind) => {
    const dto = externalAccountEvent(kind);

    expect(isWorkspaceMessengerEventDto(dto)).toBe(true);
    expect(normalizeWorkspaceRestEvent(dto)).toEqual({
      epoch_version: 42,
      type: "external_account",
      kind,
      external_account: accountSnapshot(),
    });
  });

  it("rejects an external account event whose payload UUID differs from its snapshot", () => {
    const dto = externalAccountEvent("external_account.updated");
    const payload = dto.payload as WorkspaceMessengerExternalAccountEventPayloadDto;
    dto.payload = {
      ...payload,
      uuid: "50000000-0000-4000-8000-000000000005",
    };

    expect(isWorkspaceMessengerEventDto(dto)).toBe(false);
  });
});
