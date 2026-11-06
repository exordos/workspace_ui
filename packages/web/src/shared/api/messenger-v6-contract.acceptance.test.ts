import { describe, expect, it, vi } from "vitest";
import {
  normalizeWorkspaceRestEvent,
  parseWorkspaceWebSocketFrame,
} from "./messenger-realtime.api";
import { createStream, getStreamsPage } from "./messenger-streams.api";
import { isWorkspaceMessengerEventDto, isWorkspaceMessengerStreamDto } from "./messenger.types";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const REACTION_UUID = "fae5c55d-9bb2-4646-9c03-f4a6dd65c9f0";
const PROVIDER_UUID = "81ffbd82-1f6f-4d85-b44b-b0cd8b4190fb";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const DATE = "2026-06-22T10:10:00Z";

const streamDto = {
  uuid: STREAM_UUID,
  name: "Engineering",
  description: "Engineering workspace",
  project_id: PROJECT_UUID,
  owner: USER_UUID,
  user_uuid: USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  unread_count: 3,
  active_unread_count: 3,
  passive_unread_count: 0,
  source_name: "native",
  provider_uuid: null,
  provider_identity: null,
  status: "active",
  invite_only: false,
  announce: false,
  private: false,
  is_archived: false,
  direct_user_uuid: null,
  created_at: DATE,
  updated_at: DATE,
} as const;

function optionsWithResponse(body: unknown) {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
    );
  return { accessToken: "test-token", projectId: PROJECT_UUID, fetchImpl };
}

describe("v6 flattened messenger provider contract", () => {
  it.each(["native", "zulip"] as const)("accepts a %s stream without source", (sourceName) => {
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, source_name: sourceName })).toBe(true);
  });

  it("loads Zulip streams and preserves their flat provider identity", async () => {
    const zulipStream = {
      ...streamDto,
      source_name: "zulip",
      provider_uuid: PROVIDER_UUID,
      provider_identity: "42",
    };
    const page = await getStreamsPage(optionsWithResponse([zulipStream]));
    const stream = page.items[0];
    expect(stream).toBeDefined();
    if (!stream) throw new Error("Expected a stream");
    expect(stream).toMatchObject({
      source_name: "zulip",
      provider_uuid: PROVIDER_UUID,
      provider_identity: "42",
    });
    expect(stream).not.toHaveProperty("source");
  });

  it.each(["created", "updated", "deleted"] as const)(
    "recognizes a v6 reaction %s event without source over WebSocket",
    (action) => {
      const payload = {
        kind: `message_reaction.${action}`,
        uuid: REACTION_UUID,
        project_id: PROJECT_UUID,
        message_uuid: MESSAGE_UUID,
        user_uuid: USER_UUID,
        emoji_name: "thumbs_up",
        source_name: "zulip",
        provider_uuid: PROVIDER_UUID,
        provider_identity: "42:thumbs_up",
        old_message_uuid: action === "updated" ? MESSAGE_UUID : null,
        old_emoji_name: action === "updated" ? "eyes" : null,
        old_source_name: action === "updated" ? "zulip" : null,
        old_provider_uuid: action === "updated" ? PROVIDER_UUID : null,
        old_provider_identity: action === "updated" ? "42:eyes" : null,
      };
      const event = {
        schema_version: 1,
        epoch_version: 124,
        uuid: EVENT_UUID,
        project_id: PROJECT_UUID,
        user_uuid: USER_UUID,
        object_type: "message_reaction",
        action,
        payload,
        created_at: DATE,
        updated_at: DATE,
      };
      expect(isWorkspaceMessengerEventDto(event)).toBe(true);
      if (!isWorkspaceMessengerEventDto(event)) throw new Error("Expected a known reaction event");
      const frame = parseWorkspaceWebSocketFrame(JSON.stringify(event));
      expect(isWorkspaceMessengerEventDto(frame)).toBe(true);
      expect(frame).toMatchObject({ payload });
      // Reaction aggregates arrive in message.updated; row events never increment counters here.
      expect(normalizeWorkspaceRestEvent(event)).toBeNull();
    },
  );

  it("normalizes the v6 message snapshot carrying updated reaction aggregates", () => {
    const message = {
      uuid: MESSAGE_UUID,
      project_id: PROJECT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
      author_uuid: USER_UUID,
      user_uuid: USER_UUID,
      payload: { kind: "markdown", content: "Example" },
      read: false,
      pinned: false,
      starred: false,
      is_own: false,
      source_name: "zulip",
      provider_uuid: PROVIDER_UUID,
      provider_identity: "42",
      reactions: { thumbs_up: 1 },
      reaction_users: { thumbs_up: [USER_UUID] },
      created_at: DATE,
      updated_at: DATE,
    };
    const event = {
      schema_version: 1,
      epoch_version: 125,
      uuid: EVENT_UUID,
      project_id: PROJECT_UUID,
      user_uuid: USER_UUID,
      object_type: "message",
      action: "updated",
      payload: { kind: "message.updated", ...message },
      created_at: DATE,
      updated_at: DATE,
    };
    expect(isWorkspaceMessengerEventDto(event)).toBe(true);
    if (!isWorkspaceMessengerEventDto(event)) throw new Error("Expected a known message event");
    expect(normalizeWorkspaceRestEvent(event)).toMatchObject({
      type: "message",
      kind: "message.updated",
      message,
    });
  });

  it("creates a native stream using source_name without the removed source field", async () => {
    const options = optionsWithResponse(streamDto);
    await expect(
      createStream(options, {
        name: "Engineering",
        description: "Engineering workspace",
        source_name: "native",
      }),
    ).resolves.toEqual(streamDto);
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
    const request = options.fetchImpl.mock.calls[0]?.[1];
    if (typeof request?.body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(request.body)).toEqual({
      name: "Engineering",
      description: "Engineering workspace",
      source_name: "native",
    });
  });
});
