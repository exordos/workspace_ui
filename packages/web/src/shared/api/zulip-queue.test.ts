/**
 * Tests for Zulip API (zulip-queue module).
 */
import "./zulip.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import {
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
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
    });
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
      expect.objectContaining({ method: "POST" }),
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
  it("returns unread count from unread_msgs payload", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        unread_msgs: {
          streams: [{ unread_message_ids: [1, 2] }],
          pms: [{ unread_message_ids: [3] }],
          huddles: [],
          mentions: [],
        },
      }),
    );

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBe(3);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/users/me/unread_messages",
      expect.objectContaining({ method: "GET" }),
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
        unread_msgs: {
          streams: [{ unread_message_ids: [1] }],
          pms: [],
          huddles: [],
          mentions: [],
        },
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
