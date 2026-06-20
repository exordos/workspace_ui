/**
 * Tests for Zulip API (zulip-queue module).
 */
import "./zulip.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import {
  DEFAULT_REGISTER_FETCH_EVENT_TYPES,
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
  getCachedOwnAvatarCapabilities,
  getEvents,
  getEventsForCredentials,
  registerQueue,
  registerQueueForCredentials,
} from "./zulip-queue";
import {
  getMockRefreshZulipApiBase,
  getMockZulipApi,
  jsonResponse,
  mockFetch,
} from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();
const mockRefreshZulipApiBase = getMockRefreshZulipApiBase();

describe("registerQueue", () => {
  it("returns queue_id and last_event_id on success", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        event_queue_longpoll_timeout_seconds: 90,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message", "presence"]);
    expect(result).toEqual({
      queue_id: "q-123",
      last_event_id: -1,
      event_queue_longpoll_timeout_seconds: 90,
    });
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.post).toHaveBeenCalledWith("/register", {
      event_types: JSON.stringify(["message", "presence"]),
      apply_markdown: "false",
      client_capabilities: JSON.stringify({
        notification_settings_null: true,
        bulk_message_deletion: true,
        user_avatar_url_field_optional: true,
        stream_typing_notifications: true,
        user_settings_object: true,
        archived_channels: true,
        empty_topic_name: true,
      }),
      fetch_event_types: JSON.stringify([...DEFAULT_REGISTER_FETCH_EVENT_TYPES]),
    });
  });

  it("parses starred message ids from register metadata", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-starred",
        last_event_id: 1,
        starred_messages: [55, 56, 56, "bad", -1, 57],
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message", "update_message_flags"]);

    expect(result.starred_message_ids).toEqual([55, 56, 57]);
  });

  it("throws on error result", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", msg: "Rate limited", code: "RATE_LIMITED" },
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow("Rate limited");
  });

  it("throws on missing queue_id", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow();
  });

  it("throws on invalid JSON", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow();
  });

  it("parses recent_private_conversations from register payload (map format)", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        recent_private_conversations: {
          "1": {
            user_ids: [10, 20],
            max_message_id: 555,
            unread_message_ids: [551, 552],
          },
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.recent_private_conversations).toEqual({
      "1": {
        user_ids: [10, 20],
        max_message_id: 555,
        unread_message_ids: [551, 552],
      },
    });
  });

  it("parses recent_private_conversations from register payload (Zulip array format)", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-456",
        last_event_id: -1,
        recent_private_conversations: [
          {
            user_ids: [20],
            max_message_id: 900,
            unread_message_ids: [900],
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.recent_private_conversations).toEqual({
      "20": {
        user_ids: [20],
        max_message_id: 900,
        unread_message_ids: [900],
      },
    });
  });

  it("parses user_status snapshot from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-status",
        last_event_id: -1,
        user_status: {
          "10": {
            status_text: "Heads down",
            emoji_name: "speech_balloon",
            emoji_code: "1f4ac",
            reaction_type: "unicode_emoji",
            away: true,
          },
          "11": {
            status_text: "",
            emoji_name: "",
            away: false,
          },
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.userStatusSnapshot).toEqual([
      {
        userId: 10,
        status: {
          text: "Heads down",
          emojiName: "speech_balloon",
          emojiCode: "1f4ac",
          reactionType: "unicode_emoji",
          away: true,
        },
      },
    ]);
  });

  it("keeps empty user_status snapshot when register field is present but empty", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-empty-status",
        last_event_id: -1,
        user_status: {},
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.userStatusSnapshot).toEqual([]);
  });

  it("leaves userStatusSnapshot undefined when register field is absent", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-no-status",
        last_event_id: -1,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result).not.toHaveProperty("userStatusSnapshot");
  });

  it("parses subscriptions from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        subscriptions: [
          { stream_id: 10, name: "general", is_muted: true, is_archived: false },
          { stream_id: 11, name: "dev", in_home_view: false, is_archived: true },
        ],
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"], ["subscription"]);
    expect(result.subscriptions).toEqual([
      { stream_id: 10, name: "general", is_muted: true, is_archived: false },
      { stream_id: 11, name: "dev", is_muted: true, is_archived: true },
    ]);
  });

  it("parses unread_msgs into unread_snapshot from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        unread_msgs: {
          count: 4,
          streams: [{ stream_id: 10, topic: "general", unread_message_ids: [1, 2] }],
          pms: [{ other_user_id: 20, unread_message_ids: [3] }],
          huddles: [],
          mentions: [{ unread_message_ids: [4] }],
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message", "update_message_flags"]);
    expect(result.unread_snapshot).toEqual({
      streams: [{ streamId: 10, topic: "general", unreadMessageIds: [1, 2] }],
      dms: [{ userIds: [20], unreadMessageIds: [3], isGroup: false }],
      totalCount: 4,
      mentionMessageIds: [4],
    });
  });

  it("sets oldUnreadsMissing on unread_snapshot when register reports truncation", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        unread_msgs: {
          count: 1,
          streams: [],
          pms: [{ sender_id: 20, unread_message_ids: [1] }],
          huddles: [],
          mentions: [],
          old_unreads_missing: true,
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message", "update_message_flags"]);
    expect(result.unread_snapshot?.oldUnreadsMissing).toBe(true);
    expect(result.unread_snapshot?.totalCount).toBe(1);
  });

  it("parses server_thumbnail_formats when realm metadata is returned", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        server_thumbnail_formats: [
          {
            name: "840x560.webp",
            max_width: 840,
            max_height: 560,
            format: "webp",
            animated: false,
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.server_thumbnail_formats).toEqual([
      {
        name: "840x560.webp",
        max_width: 840,
        max_height: 560,
        format: "webp",
        animated: false,
      },
    ]);
  });

  it("parses avatar capabilities from register payload and caches them", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        max_avatar_file_size_mib: 15,
        realm_avatar_changes_disabled: false,
        server_avatar_changes_disabled: true,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.max_avatar_file_size_mib).toBe(15);
    expect(result.realm_avatar_changes_disabled).toBe(false);
    expect(result.server_avatar_changes_disabled).toBe(true);
    expect(getCachedOwnAvatarCapabilities()).toEqual({
      max_avatar_file_size_mib: 15,
      realm_avatar_changes_disabled: false,
      server_avatar_changes_disabled: true,
    });
  });

  it("includes jitsi_server_url_effective from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        jitsi_server_url: "https://calls.example.com/",
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.jitsi_server_url_effective).toBe("https://calls.example.com");
  });

  it("parses modern realm add-subscribers group from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        realm_can_add_subscribers_group: {
          direct_members: [10],
          direct_subgroups: [14],
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.realm_can_add_subscribers_group).toEqual({
      direct_members: [10],
      direct_subgroups: [14],
    });
  });

  it("parses message edit policy from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        realm_allow_message_editing: true,
        realm_message_content_edit_limit_seconds: 600,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.realm_allow_message_editing).toBe(true);
    expect(result.realm_message_content_edit_limit_seconds).toBe(600);
  });

  it("parses null message edit time limit from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        realm_message_content_edit_limit_seconds: null,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.realm_message_content_edit_limit_seconds).toBeNull();
  });

  it("normalizes legacy zero message edit time limit from register payload to null", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        realm_message_content_edit_limit_seconds: 0,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.realm_message_content_edit_limit_seconds).toBeNull();
  });

  it("ignores invalid message edit policy values from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        realm_allow_message_editing: "yes",
        realm_message_content_edit_limit_seconds: -1,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.realm_allow_message_editing).toBeUndefined();
    expect(result.realm_message_content_edit_limit_seconds).toBeUndefined();
  });
});

describe("registerQueueForCredentials", () => {
  it("registers queue via direct fetch for explicit credentials", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        queue_id: "q-explicit",
        last_event_id: 44,
        event_queue_longpoll_timeout_seconds: 90,
      }),
    );

    const result = await registerQueueForCredentials(
      {
        realm: "https://other.example.com",
        email: "other@test.com",
        apiKey: "key",
      },
      ["message", "typing"],
    );

    expect(result).toEqual({
      queue_id: "q-explicit",
      last_event_id: 44,
      event_queue_longpoll_timeout_seconds: 90,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/register",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          `client_capabilities=${encodeURIComponent(
            JSON.stringify({
              notification_settings_null: true,
              bulk_message_deletion: true,
              user_avatar_url_field_optional: true,
              stream_typing_notifications: true,
              user_settings_object: true,
              archived_channels: true,
              empty_topic_name: true,
            }),
          )}`,
        ),
      }),
    );
  });

  it("fails fast when credentials realm url uses unsupported protocol", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        queue_id: "q-explicit",
        last_event_id: 44,
      }),
    );

    await expect(
      registerQueueForCredentials(
        {
          realm: "ftp://malicious.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        ["message"],
      ),
    ).rejects.toThrow(/registerQueueForCredentials\.realm/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteQueue — best-effort, swallows errors
// ---------------------------------------------------------------------------

describe("deleteQueue", () => {
  it("uses shared delete transport for the current instance path", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await deleteQueue("q-123");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/events", { queue_id: "q-123" });
  });

  it("does nothing when no instance and no credentials", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    await deleteQueue("q-123");
    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("swallows shared transport errors", async () => {
    mockZulipApi.delete.mockRejectedValue(new TypeError("Network error"));
    await expect(deleteQueue("q-123")).resolves.toBeUndefined();
  });

  it("keeps explicit-credentials cleanup on the raw fetch path", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    mockFetch.mockResolvedValue(jsonResponse({ result: "success" }));
    await deleteQueue("q-123", {
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });
    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/events",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("skips cleanup when queue id is blank", async () => {
    await deleteQueue("   ");
    await deleteQueue("", {
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips explicit-credentials cleanup when realm url is invalid", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    mockFetch.mockResolvedValue(jsonResponse({ result: "success" }));

    await expect(
      deleteQueue("q-123", {
        realm: "ftp://malicious.example.com",
        email: "other@test.com",
        apiKey: "key",
      }),
    ).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchUnreadMessagesCountForCredentials
// ---------------------------------------------------------------------------

describe("fetchUnreadMessagesCountForCredentials", () => {
  it("returns unread count from messages payload", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        messages: [{ id: 1 }, { id: 2 }, { id: 3 }],
      }),
    );

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];
    const calledUrl = new URL(String(fetchArgs?.[0]));
    expect(fetchArgs?.[1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(calledUrl.origin).toBe("https://other.example.com");
    expect(calledUrl.pathname).toBe("/api/v1/messages");
    expect(calledUrl.searchParams.get("anchor")).toBe("newest");
    expect(calledUrl.searchParams.get("num_before")).toBe("5000");
    expect(calledUrl.searchParams.get("num_after")).toBe("0");
    expect(calledUrl.searchParams.get("narrow")).toBe(
      JSON.stringify([{ operator: "is", operand: "unread" }]),
    );
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ result: "error" }, 500));

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBeNull();
  });

  it("returns null without network call when realm url is invalid", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        messages: [{ id: 1 }],
      }),
    );

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "ftp://malicious.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getEvents — long-polling
// ---------------------------------------------------------------------------

describe("getEvents", () => {
  it("returns events on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", events: [{ id: 1, type: "message" }] },
      raw: { statusText: "OK" },
    });

    const result = await getEvents("q-123", 0);
    expect(result.events).toHaveLength(1);
    expect(result.events![0]!.type).toBe("message");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.get).toHaveBeenCalledWith(
      "/events",
      { queue_id: "q-123", last_event_id: "0" },
      expect.any(AbortSignal),
    );
  });

  it("throws when no instance", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    await expect(getEvents("q-123", 0)).rejects.toThrow();
  });

  it("returns BAD_EVENT_QUEUE_ID error body for the event loop to re-register", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 400,
      data: {
        result: "error",
        code: "BAD_EVENT_QUEUE_ID",
        msg: "Invalid event queue ID",
        queue_id: "q-stale",
      },
      raw: { statusText: "Bad Request" },
    });

    const result = await getEvents("q-stale", 0);
    expect(result).toMatchObject({
      result: "error",
      code: "BAD_EVENT_QUEUE_ID",
    });
  });

  it("returns error result for invalid JSON body", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
      raw: { statusText: "OK" },
    });

    const result = await getEvents("q-123", 0);
    expect(result.result).toBe("error");
  });

  it("throws for blank queue id", async () => {
    await expect(getEvents("   ", 0)).rejects.toThrow(
      /getEvents\.queueId must be a non-empty string/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for cursor below -1", async () => {
    await expect(getEvents("q-123", -2)).rejects.toThrow(
      /getEvents\.lastEventId must be an integer >= -1/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for non-integer cursor", async () => {
    await expect(getEvents("q-123", 1.5)).rejects.toThrow(
      /getEvents\.lastEventId must be an integer >= -1/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("removes the outer abort listener after the request completes", async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", events: [{ id: 1, type: "message" }] },
      raw: { statusText: "OK" },
    });

    await getEvents("q-123", 0, { signal: controller.signal });

    expect(addSpy).toHaveBeenCalled();
    const addedAbortCall = addSpy.mock.calls.find((call) => call[0] === "abort");
    expect(addedAbortCall).toBeDefined();
    const addedHandler = addedAbortCall?.[1];
    expect(removeSpy).toHaveBeenCalledWith("abort", addedHandler);
  });
});

describe("getEventsForCredentials", () => {
  it("polls events using explicit credentials", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        events: [{ id: 101, type: "message" }],
      }),
    );

    const result = await getEventsForCredentials(
      {
        realm: "https://other.example.com",
        email: "other@test.com",
        apiKey: "key",
      },
      "q-xyz",
      12,
    );

    expect(result.result).toBe("success");
    expect(result.events).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/events?queue_id=q-xyz&last_event_id=12",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when credentials realm url uses unsupported protocol", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        events: [{ id: 101, type: "message" }],
      }),
    );

    await expect(
      getEventsForCredentials(
        {
          realm: "ftp://malicious.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        12,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.realm/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for blank queue id", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "  ",
        12,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.queueId must be a non-empty string/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for cursor below -1", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        -2,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.lastEventId must be an integer >= -1/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for non-integer cursor", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        1.25,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.lastEventId must be an integer >= -1/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — authenticated GET
// ---------------------------------------------------------------------------
