import { describe, expect, it } from "vitest";
import { isWorkspaceExternalChatDto } from "./messenger-external-chats.types";

function chat(chatType: string) {
  return {
    uuid: "chat-uuid",
    external_account_uuid: "account-uuid",
    source: { kind: "zulip", chat_type: chatType },
    display_name: "Support",
    selected: false,
    project_id: null,
    history_depth: "30_days",
    projection_stream_uuid: null,
    status: "available",
    capabilities: {},
    safe_error: null,
    transition_pending: false,
    revision: 1,
    created_at: "2026-07-23T10:00:00Z",
    updated_at: "2026-07-23T10:00:00Z",
  };
}

describe("isWorkspaceExternalChatDto", () => {
  it.each(["channel", "personal", "group"])("accepts public chat type %s", (type) => {
    expect(isWorkspaceExternalChatDto(chat(type))).toBe(true);
  });

  it.each(["direct", "group_direct", "stream"])(
    "rejects internal or unsupported chat type %s",
    (type) => {
      expect(isWorkspaceExternalChatDto(chat(type))).toBe(false);
    },
  );
});
