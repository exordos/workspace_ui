/**
 * Tests for Zulip API (zulip-streams module).
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line import-x/order -- must run before API modules to register vi.mock hooks
import { getMockZulipApi, getMockZulipClient, TEST_INSTANCE } from "./zulip.test.setup";
import { getCurrentInstance } from "./client";
import { fetchUserTopics, registerQueue } from "./zulip-queue";
import {
  addMembersToStream,
  deleteTopic,
  deleteStream,
  fetchStreamMembers,
  fetchStreams,
  fetchSubscriptions,
  fetchTopics,
  removeMembersFromStream,
  updateStream,
} from "./zulip-streams";

const mockZulipApi = getMockZulipApi();
const mockZulipClient = getMockZulipClient();

describe("fetchSubscriptions", () => {
  it("maps subscriptions and derives muted state", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        subscriptions: [
          { stream_id: 1, name: "general", is_muted: true },
          { stream_id: 2, name: "dev", in_home_view: false },
        ],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      { stream_id: 1, name: "general", is_muted: true },
      { stream_id: 2, name: "dev", is_muted: true },
    ]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/me/subscriptions", undefined);
  });

  it("maps channel-level remove-members group metadata", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        subscriptions: [
          {
            stream_id: 1,
            name: "general",
            is_muted: false,
            creator_id: 77,
            can_remove_subscribers_group: { direct_members: [42], direct_subgroups: [] },
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_id: 1,
        name: "general",
        is_muted: false,
        creator_id: 77,
        can_remove_subscribers_group: { direct_members: [42], direct_subgroups: [] },
      },
    ]);
  });
});

describe("fetchUserTopics", () => {
  it("returns user topic visibility overrides cached from register", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-with-topics",
        last_event_id: -1,
        user_topics: [{ stream_id: 10, topic_name: "bugs", visibility_policy: 1 }],
      },
      raw: { statusText: "OK" },
    });

    await registerQueue(["message", "user_topic"]);
    await expect(fetchUserTopics()).resolves.toEqual([
      { stream_id: 10, topic_name: "bugs", visibility_policy: 1 },
    ]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("returns empty array when register cache is not available", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      email: "uncached@example.com",
    });

    await expect(fetchUserTopics()).resolves.toEqual([]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });
});

describe("fetchStreamMembers", () => {
  it("returns subscriber ids", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { subscribers: [1, 2, 3] },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamMembers(10)).resolves.toEqual([1, 2, 3]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/streams/10/members", undefined);
  });
});

describe("addMembersToStream", () => {
  it("posts subscriptions and principals and returns normalized success result", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        subscribed: {
          "1": [{ id: 10, name: "engineering" }],
          "3": [{ id: 10, name: "engineering" }],
        },
        already_subscribed: {
          "2": [{ id: 10, name: "engineering" }],
        },
      },
      raw: { statusText: "OK" },
    });

    await expect(
      addMembersToStream({
        streamName: "engineering",
        userIds: [3, 1, 2, 1],
      }),
    ).resolves.toEqual({
      ok: true,
      addedUserIds: [1, 3],
      alreadySubscribedUserIds: [2],
      unauthorizedStreams: [],
    });
    expect(mockZulipApi.post).toHaveBeenCalledWith("/users/me/subscriptions", {
      subscriptions: JSON.stringify([{ name: "engineering" }]),
      principals: JSON.stringify([1, 2, 3]),
    });
  });

  it("passes authorization_errors_fatal when provided", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await addMembersToStream({
      streamName: "engineering",
      userIds: [1],
      authorizationErrorsFatal: false,
    });

    expect(mockZulipApi.post).toHaveBeenCalledWith(
      "/users/me/subscriptions",
      expect.objectContaining({
        authorization_errors_fatal: "false",
      }),
    );
  });

  it("returns error result for non-ok http response", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(
      addMembersToStream({
        streamName: "engineering",
        userIds: [1],
      }),
    ).resolves.toEqual({
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "http_403",
    });
  });

  it("returns error result when api response is result=error", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "error",
        code: "BAD_REQUEST",
        unauthorized: ["engineering"],
      },
      raw: { statusText: "OK" },
    });

    await expect(
      addMembersToStream({
        streamName: "engineering",
        userIds: [1],
      }),
    ).resolves.toEqual({
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: ["engineering"],
      errorCode: "BAD_REQUEST",
    });
  });

  it("does not assume additions when subscribed map has no numeric principals", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        subscribed: {
          "alice@example.com": [{ id: 10, name: "engineering" }],
        },
        already_subscribed: {
          "2": [{ id: 10, name: "engineering" }],
        },
      },
      raw: { statusText: "OK" },
    });

    await expect(
      addMembersToStream({
        streamName: "engineering",
        userIds: [1, 2, 3],
      }),
    ).resolves.toEqual({
      ok: true,
      addedUserIds: [],
      alreadySubscribedUserIds: [2],
      unauthorizedStreams: [],
    });
  });

  it("falls back to requested-minus-already only when subscribed is absent", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        already_subscribed: {
          "2": [{ id: 10, name: "engineering" }],
        },
      },
      raw: { statusText: "OK" },
    });

    await expect(
      addMembersToStream({
        streamName: "engineering",
        userIds: [1, 2, 3],
      }),
    ).resolves.toEqual({
      ok: true,
      addedUserIds: [1, 3],
      alreadySubscribedUserIds: [2],
      unauthorizedStreams: [],
    });
  });

  it("throws on blank stream name (guard)", async () => {
    await expect(
      addMembersToStream({
        streamName: "   ",
        userIds: [1],
      }),
    ).rejects.toThrow(/addMembersToStream\.streamName must be a non-empty string/);
  });
});

describe("removeMembersFromStream", () => {
  it("sends delete payload and returns normalized success result", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        removed: {
          "1": [{ id: 10, name: "engineering" }],
          "3": [{ id: 10, name: "engineering" }],
        },
        already_unsubscribed: {
          "2": [{ id: 10, name: "engineering" }],
        },
      },
      raw: { statusText: "OK" },
    });

    await expect(
      removeMembersFromStream({
        streamName: "engineering",
        userIds: [3, 1, 2, 1],
      }),
    ).resolves.toEqual({
      ok: true,
      removedUserIds: [1, 3],
      alreadyUnsubscribedUserIds: [2],
      unauthorizedStreams: [],
    });

    expect(mockZulipApi.delete).toHaveBeenCalledWith("/users/me/subscriptions", {
      subscriptions: JSON.stringify(["engineering"]),
      principals: JSON.stringify([1, 2, 3]),
    });
  });

  it("passes authorization_errors_fatal when provided", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await removeMembersFromStream({
      streamName: "engineering",
      userIds: [1],
      authorizationErrorsFatal: false,
    });

    expect(mockZulipApi.delete).toHaveBeenCalledWith(
      "/users/me/subscriptions",
      expect.objectContaining({
        authorization_errors_fatal: "false",
      }),
    );
  });

  it("returns error result for non-ok http response", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(
      removeMembersFromStream({
        streamName: "engineering",
        userIds: [1],
      }),
    ).resolves.toEqual({
      ok: false,
      removedUserIds: [],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "http_403",
    });
  });

  it("returns error result when api response is result=error", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "error",
        code: "BAD_REQUEST",
        unauthorized: ["engineering"],
      },
      raw: { statusText: "OK" },
    });

    await expect(
      removeMembersFromStream({
        streamName: "engineering",
        userIds: [1],
      }),
    ).resolves.toEqual({
      ok: false,
      removedUserIds: [],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: ["engineering"],
      errorCode: "BAD_REQUEST",
    });
  });

  it("throws on blank stream name (guard)", async () => {
    await expect(
      removeMembersFromStream({
        streamName: "   ",
        userIds: [1],
      }),
    ).rejects.toThrow(/removeMembersFromStream\.streamName must be a non-empty string/);
  });
});

describe("fetchTopics", () => {
  it("returns topic names for an existing stream", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });
    mockZulipClient.streams.topics.retrieve.mockResolvedValue({
      topics: [{ name: "planning" }, { name: "release" }],
    });

    await expect(fetchTopics("engineering")).resolves.toEqual(["planning", "release"]);
    expect(mockZulipClient.streams.topics.retrieve).toHaveBeenCalledWith({ stream_id: 10 });
  });

  it("returns empty array when stream is not found", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });

    await expect(fetchTopics("design")).resolves.toEqual([]);
    expect(mockZulipClient.streams.topics.retrieve).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchTopics("   ")).rejects.toThrow(
      /fetchTopics\.stream must be a non-empty string/,
    );
    expect(mockZulipClient.streams.retrieve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchStreams — uses zulip-js client
// ---------------------------------------------------------------------------

describe("fetchStreams", () => {
  it("returns mapped streams", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [
        { stream_id: 1, name: "general", description: "Main" },
        { stream_id: 2, name: "dev" },
      ],
    });

    const result = await fetchStreams();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      stream_id: 1,
      name: "general",
      description: "Main",
      is_announcement_only: false,
    });
    expect(result[1]!.description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fetchMessages — uses zulip-js client
// ---------------------------------------------------------------------------
describe("updateStream", () => {
  it("patches stream name and description", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(
      updateStream(10, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/streams/10", {
      new_name: "platform",
      description: "Platform discussions",
    });
  });

  it("returns false when stream update API is not ok", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(10, { name: "platform" })).resolves.toBe(false);
  });
});

describe("deleteStream", () => {
  it("deletes stream by id", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteStream(10)).resolves.toBe(true);
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/streams/10", undefined);
  });

  it("returns false on delete failure", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteStream(10)).resolves.toBe(false);
  });
});

describe("deleteTopic", () => {
  it("deletes topic in one request when complete=true", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", complete: true },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(10, "incident")).resolves.toEqual({
      ok: true,
      complete: true,
      attempts: 1,
    });
    expect(mockZulipApi.post).toHaveBeenCalledWith("/streams/10/delete_topic", {
      topic_name: "incident",
    });
  });

  it("allows deleting empty topic name", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", complete: true },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(10, "   ")).resolves.toEqual({
      ok: true,
      complete: true,
      attempts: 1,
    });
    expect(mockZulipApi.post).toHaveBeenCalledWith("/streams/10/delete_topic", {
      topic_name: "",
    });
  });

  it("retries on complete=false and succeeds on second attempt", async () => {
    mockZulipApi.post
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { result: "success", complete: false },
        raw: { statusText: "OK" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { result: "success", complete: true },
        raw: { statusText: "OK" },
      });

    await expect(deleteTopic(10, "incident")).resolves.toEqual({
      ok: true,
      complete: true,
      attempts: 2,
    });
    expect(mockZulipApi.post).toHaveBeenCalledTimes(2);
  });

  it("returns incomplete_after_retries when complete stays false", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", complete: false },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(10, "incident", 3)).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 3,
      errorCode: "incomplete_after_retries",
    });
    expect(mockZulipApi.post).toHaveBeenCalledTimes(3);
  });

  it("returns authorization error from API payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", code: "UNAUTHORIZED_PRINCIPAL" },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(10, "incident")).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "UNAUTHORIZED_PRINCIPAL",
    });
  });

  it("returns http error for non-ok response", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad Request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteTopic(10, "incident")).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "http_400",
    });
  });

  it("returns network_error on request failure", async () => {
    mockZulipApi.post.mockRejectedValue(new Error("offline"));

    await expect(deleteTopic(10, "incident")).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "network_error",
    });
  });
});

// ---------------------------------------------------------------------------
// addReaction — authenticated POST with guard
