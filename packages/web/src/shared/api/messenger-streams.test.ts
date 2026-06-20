/**
 * Tests for Messenger API (messenger-streams module).
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line import-x/order -- must run before API modules to register vi.mock hooks
import { getMockMessengerApi, TEST_INSTANCE } from "./messenger.test.setup";
import { getCurrentInstance } from "./client";
import { fetchUserTopics, registerQueue } from "./messenger-queue";
import {
  addMembersToStream,
  deleteTopic,
  deleteStream,
  fetchStreamMembers,
  fetchStreamTopicNames,
  fetchStreams,
  fetchSubscriptions,
  fetchTopics,
  removeMembersFromStream,
  unarchiveStream,
  updateStream,
} from "./messenger-streams";

const mockMessengerApi = getMockMessengerApi();

function mockMyStreamsResponse(rows: unknown[]): void {
  mockMessengerApi.getWithBase.mockResolvedValue({
    ok: true,
    status: 200,
    data: rows,
    raw: { statusText: "OK" },
  });
}

describe("fetchSubscriptions", () => {
  it("maps non-private /me/streams rows to subscriptions", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          stream_uuid: "22222222-2222-4222-8222-222222222222",
          stream_id: 1,
          name: "general",
          description: "Main",
          invite_only: false,
          announce: false,
          private: false,
        },
        {
          uuid: "33333333-3333-4333-8333-333333333333",
          stream_uuid: "44444444-4444-4444-8444-444444444444",
          user_uuid: "55555555-5555-4555-8555-555555555555",
          name: "Alice",
          description: "",
          invite_only: false,
          announce: false,
          private: true,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_id: 1,
        stream_uuid: "22222222-2222-4222-8222-222222222222",
        name: "general",
        is_muted: false,
        invite_only: false,
      },
    ]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith("/api/messanger/v1", "/me/streams/");
  });

  it("returns empty subscriptions when gateway omits numeric stream_id", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          stream_uuid: "22222222-2222-4222-8222-222222222222",
          name: "general",
          description: "Main",
          invite_only: false,
          announce: false,
          private: false,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([]);
  });
});

describe("fetchUserTopics", () => {
  it("returns user topic visibility overrides cached from register", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("returns empty array when register cache is not available", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      login: "uncached@example.com",
    });

    await expect(fetchUserTopics()).resolves.toEqual([]);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });
});

describe("fetchStreamMembers", () => {
  it("returns subscriber ids", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { subscribers: [1, 2, 3] },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamMembers(10)).resolves.toEqual([1, 2, 3]);
    expect(mockMessengerApi.get).toHaveBeenCalledWith("/streams/10/members", undefined, undefined);
  });
});

describe("addMembersToStream", () => {
  it("posts subscriptions and principals and returns normalized success result", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    expect(mockMessengerApi.post).toHaveBeenCalledWith("/users/me/subscriptions", {
      subscriptions: JSON.stringify([{ name: "engineering" }]),
      principals: JSON.stringify([1, 2, 3]),
    });
  });

  it("passes authorization_errors_fatal when provided", async () => {
    mockMessengerApi.post.mockResolvedValue({
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

    expect(mockMessengerApi.post).toHaveBeenCalledWith(
      "/users/me/subscriptions",
      expect.objectContaining({
        authorization_errors_fatal: "false",
      }),
    );
  });

  it("returns error result for non-ok http response", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.delete.mockResolvedValue({
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

    expect(mockMessengerApi.delete).toHaveBeenCalledWith("/users/me/subscriptions", {
      subscriptions: JSON.stringify(["engineering"]),
      principals: JSON.stringify([1, 2, 3]),
    });
  });

  it("passes authorization_errors_fatal when provided", async () => {
    mockMessengerApi.delete.mockResolvedValue({
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

    expect(mockMessengerApi.delete).toHaveBeenCalledWith(
      "/users/me/subscriptions",
      expect.objectContaining({
        authorization_errors_fatal: "false",
      }),
    );
  });

  it("returns error result for non-ok http response", async () => {
    mockMessengerApi.delete.mockResolvedValue({
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
    mockMessengerApi.delete.mockResolvedValue({
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
    mockMyStreamsResponse([
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        stream_uuid: "22222222-2222-4222-8222-222222222222",
        stream_id: 10,
        name: "engineering",
        description: "",
        invite_only: false,
        announce: false,
        private: false,
      },
    ]);
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        topics: [{ name: "planning" }, { name: "release" }],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchTopics("engineering")).resolves.toEqual(["planning", "release"]);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/users/me/10/topics",
      { allow_empty_topic_name: "true" },
      undefined,
    );
  });

  it("returns raw empty topic name when server supports allow_empty_topic_name", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        topics: [{ name: "" }, { name: "release" }],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamTopicNames(10)).resolves.toEqual(["", "release"]);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/users/me/10/topics",
      { allow_empty_topic_name: "true" },
      undefined,
    );
  });

  it("returns empty array when topics endpoint is not ok", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: { result: "error" },
      raw: { statusText: "Server Error" },
    });

    await expect(fetchStreamTopicNames(10)).resolves.toEqual([]);
  });

  it("returns empty array when topics endpoint responds with error result", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "error",
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamTopicNames(10)).resolves.toEqual([]);
  });

  it("returns empty array when stream is not found", async () => {
    mockMyStreamsResponse([
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        stream_uuid: "22222222-2222-4222-8222-222222222222",
        stream_id: 10,
        name: "engineering",
        description: "",
        invite_only: false,
        announce: false,
        private: false,
      },
    ]);

    await expect(fetchTopics("design")).resolves.toEqual([]);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchTopics("   ")).rejects.toThrow(
      /fetchTopics\.stream must be a non-empty string/,
    );
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchStreams — uses Workspace gateway /me/streams
// ---------------------------------------------------------------------------

describe("fetchStreams", () => {
  it("returns mapped non-private streams", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          stream_uuid: "22222222-2222-4222-8222-222222222222",
          stream_id: 1,
          name: "general",
          description: "Main",
          announce: true,
          invite_only: false,
          private: false,
        },
        {
          uuid: "33333333-3333-4333-8333-333333333333",
          stream_uuid: "44444444-4444-4444-8444-444444444444",
          user_uuid: "55555555-5555-4555-8555-555555555555",
          name: "Alice",
          description: "",
          invite_only: false,
          announce: false,
          private: true,
        },
      ],
      raw: { statusText: "OK" },
    });

    const result = await fetchStreams();
    expect(result).toEqual([
      {
        stream_id: 1,
        stream_uuid: "22222222-2222-4222-8222-222222222222",
        name: "general",
        description: "Main",
        is_announcement_only: true,
        invite_only: false,
      },
    ]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith("/api/messanger/v1", "/me/streams/");
  });

  it("returns empty list when gateway rows only contain private streams", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "33333333-3333-4333-8333-333333333333",
          stream_uuid: "44444444-4444-4444-8444-444444444444",
          user_uuid: "55555555-5555-4555-8555-555555555555",
          name: "Alice",
          description: "",
          invite_only: false,
          announce: false,
          private: true,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchStreams()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateStream — uses Messenger REST client
// ---------------------------------------------------------------------------
describe("updateStream", () => {
  it("patches stream name and description", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(
      updateStream(10, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith("/streams/10", {
      new_name: "platform",
      description: "Platform discussions",
    });
  });

  it("serializes is_archived=false when updating archive flag", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(updateStream(10, { isArchived: false })).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith("/streams/10", { is_archived: "false" });
  });

  it("short-circuits when PATCH body would be empty", async () => {
    await expect(updateStream(10, {})).resolves.toBe(true);
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("returns false when stream update API is not ok", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(10, { name: "platform" })).resolves.toBe(false);
  });
});

describe("unarchiveStream", () => {
  it("PATCHes is_archived=false and succeeds on healthy response", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(unarchiveStream(10)).resolves.toEqual({ ok: true });
    expect(mockMessengerApi.patch).toHaveBeenCalledWith("/streams/10", { is_archived: "false" });
  });

  it("returns unsupported when server ignores is_archived parameter", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        ignored_parameters_unsupported: ["is_archived"],
      },
      raw: { statusText: "OK" },
    });

    await expect(unarchiveStream(10)).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        kind: "unsupported",
      }),
    );
  });

  it("maps HTTP failures to transient/forbidden kinds", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { result: "error", msg: "Not allowed", code: "FORBIDDEN" },
      raw: { statusText: "Forbidden" },
    });

    await expect(unarchiveStream(88)).resolves.toEqual({
      ok: false,
      kind: "forbidden",
      status: 403,
      message: "Not allowed",
      code: "FORBIDDEN",
    });
  });
});

describe("deleteStream", () => {
  it("deletes stream by id", async () => {
    mockMessengerApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteStream(10)).resolves.toBe(true);
    expect(mockMessengerApi.delete).toHaveBeenCalledWith("/streams/10", undefined);
  });

  it("returns false on delete failure", async () => {
    mockMessengerApi.delete.mockResolvedValue({
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
    mockMessengerApi.post.mockResolvedValue({
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
    expect(mockMessengerApi.post).toHaveBeenCalledWith("/streams/10/delete_topic", {
      topic_name: "incident",
    });
  });

  it("allows deleting empty topic name", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    expect(mockMessengerApi.post).toHaveBeenCalledWith("/streams/10/delete_topic", {
      topic_name: "",
    });
  });

  it("retries on complete=false and succeeds on second attempt", async () => {
    mockMessengerApi.post
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
    expect(mockMessengerApi.post).toHaveBeenCalledTimes(2);
  });

  it("returns incomplete_after_retries when complete stays false", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    expect(mockMessengerApi.post).toHaveBeenCalledTimes(3);
  });

  it("returns authorization error from API payload", async () => {
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.post.mockResolvedValue({
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
    mockMessengerApi.post.mockRejectedValue(new Error("offline"));

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
