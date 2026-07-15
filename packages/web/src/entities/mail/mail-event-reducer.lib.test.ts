import { describe, expect, it } from "vitest";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import { reduceMailWorkspaceEvent, type MailEventState } from "./mail-event-reducer.lib";

const provider = { uuid: "provider-1", name: "Mailcow", kind: "mail" };
const delivery = {
  status: "delivered",
  safe_error: null,
  updated_at: "2026-07-15T10:00:00Z",
};

const state: MailEventState = {
  folders: [{ uuid: "folder-1", path: "INBOX", name: "Inbox", unread: 0, total: 0 }],
  messages: [],
  selectedFolder: "INBOX",
  selectedUid: null,
  selectedMessage: null,
};

function messageEvent(overrides: Record<string, unknown> = {}): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: "event-1",
    epoch_version: 1,
    project_id: "project-1",
    user_uuid: "user-1",
    object_type: "mail_message",
    action: "created",
    created_at: "2026-07-15T10:00:00Z",
    updated_at: "2026-07-15T10:00:00Z",
    payload: {
      kind: "mail.message.created",
      uuid: "message-1",
      folder_uuid: "folder-1",
      from_address: "sender@example.com",
      to_addresses: ["recipient@example.com"],
      cc_addresses: [],
      subject: "Hello",
      snippet: "Preview",
      body_html: null,
      body_text: "Hello",
      message_id: null,
      reply_to: null,
      references: null,
      sent_at: "2026-07-15T10:00:00Z",
      seen: false,
      flagged: false,
      provider,
      delivery,
      ...overrides,
    },
  };
}

describe("reduceMailWorkspaceEvent", () => {
  it("upserts a full message payload with provider delivery metadata", () => {
    const result = reduceMailWorkspaceEvent(state, messageEvent());

    expect(result.complete).toBe(true);
    expect(result.patch.messages).toEqual([
      expect.objectContaining({
        uid: "message-1",
        provider,
        delivery: {
          status: "delivered",
          safeError: null,
          updatedAt: "2026-07-15T10:00:00Z",
        },
      }),
    ]);
  });

  it("removes a deleted message without a refetch", () => {
    const messages = reduceMailWorkspaceEvent(state, messageEvent()).patch.messages;
    expect(messages).toHaveLength(1);
    const populated = {
      ...state,
      messages: messages ?? [],
      selectedUid: "message-1",
    };
    const result = reduceMailWorkspaceEvent(populated, {
      ...messageEvent(),
      uuid: "event-2",
      epoch_version: 2,
      action: "deleted",
      payload: { kind: "mail.message.deleted", uuid: "message-1" },
    });

    expect(result).toMatchObject({
      complete: true,
      patch: { messages: [], selectedUid: null, selectedMessage: null },
    });
  });

  it("marks a payload without canonical delivery metadata as incomplete", () => {
    const result = reduceMailWorkspaceEvent(state, messageEvent({ delivery: undefined }));
    expect(result).toEqual({ complete: false, patch: {} });
  });

  it("rejects a message kind carried by the mail-folder object type", () => {
    const event = messageEvent();
    event.object_type = "mail_folder";

    expect(reduceMailWorkspaceEvent(state, event)).toEqual({ complete: false, patch: {} });
  });
});
