import { describe, expect, it } from "vitest";
import { normalizeWorkspaceRestEvent } from "./messenger-realtime.api";
import {
  isWorkspaceMessengerEventDto,
  type WorkspaceMessengerEventDto,
  type WorkspaceMessengerExternalChatEventPayloadDto,
} from "./messenger.types";

const CHAT_UUID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_UUID = "20000000-0000-4000-8000-000000000002";
const PROJECT_UUID = "30000000-0000-4000-8000-000000000003";
const USER_UUID = "40000000-0000-4000-8000-000000000004";

function chatSnapshot(revision = 3) {
  return {
    uuid: CHAT_UUID,
    external_account_uuid: ACCOUNT_UUID,
    source: {
      kind: "zulip" as const,
      chat_type: "personal" as const,
      original_url: "https://zulip.example.com/#narrow/dm/1,2-dm",
    },
    display_name: "User One, User Two",
    selected: true,
    project_id: PROJECT_UUID,
    history_depth: "30_days" as const,
    projection_stream_uuid: "50000000-0000-4000-8000-000000000005",
    status: "syncing" as const,
    capabilities: {},
    safe_error: null,
    transition_pending: false,
    revision,
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T10:01:00Z",
  };
}

function externalChatEvent(
  kind: "external_chat.created" | "external_chat.updated" | "external_chat.deleted",
): WorkspaceMessengerEventDto {
  const action = kind.split(".")[1] as "created" | "updated" | "deleted";
  return {
    schema_version: 1,
    epoch_version: 42,
    uuid: "60000000-0000-4000-8000-000000000006",
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "external_chat",
    action,
    payload: {
      kind,
      uuid: CHAT_UUID,
      snapshot: chatSnapshot(),
    },
    created_at: "2026-07-24T10:01:00Z",
    updated_at: "2026-07-24T10:01:00Z",
  };
}

describe("external chat realtime transport", () => {
  it.each(["external_chat.created", "external_chat.updated", "external_chat.deleted"] as const)(
    "validates and normalizes the full %s snapshot",
    (kind) => {
      const dto = externalChatEvent(kind);

      expect(isWorkspaceMessengerEventDto(dto)).toBe(true);
      expect(normalizeWorkspaceRestEvent(dto)).toEqual({
        epoch_version: 42,
        type: "external_chat",
        kind,
        external_chat: chatSnapshot(),
      });
    },
  );

  it("rejects an external chat event whose payload UUID differs from its snapshot", () => {
    const dto = externalChatEvent("external_chat.updated");
    const payload = dto.payload as WorkspaceMessengerExternalChatEventPayloadDto;
    dto.payload = {
      ...payload,
      uuid: "70000000-0000-4000-8000-000000000007",
    };

    expect(isWorkspaceMessengerEventDto(dto)).toBe(false);
  });

  it("rejects metadata that does not match the payload kind", () => {
    const dto = externalChatEvent("external_chat.updated");
    dto.action = "created";

    expect(isWorkspaceMessengerEventDto(dto)).toBe(false);
  });
});
