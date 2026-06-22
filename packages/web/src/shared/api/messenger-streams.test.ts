/**
 * Tests for Messenger API (messenger-streams module).
 */
import { describe, expect, it, vi } from "vitest";
import {
  addMembersToStream,
  createPrivateMessageStream,
  deleteTopic,
  deleteStream,
  fetchStreamMembers,
  fetchStreamTopicNames,
  fetchStreams,
  fetchSubscriptions,
  fetchTopics,
  findPrivateStreamForUserUuid,
  removeMembersFromStream,
  resolveOrCreateDirectMessageStream,
  unarchiveStream,
  updateStream,
} from "./messenger-streams";
import { getMockMessengerApi } from "./messenger.test.setup";

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
  it("maps /streams rows to UUID subscriptions", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          name: "general",
          description: "Main",
          invite_only: false,
          announce: false,
          private: false,
          unread_count: 5,
        },
        {
          uuid: "33333333-3333-4333-8333-333333333333",
          user_uuid: "55555555-5555-4555-8555-555555555555",
          name: "Alice",
          description: "",
          invite_only: false,
          announce: false,
          private: true,
          unread_count: 2,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        is_muted: false,
        invite_only: false,
        private: false,
        unread_count: 5,
      },
      {
        stream_uuid: "33333333-3333-4333-8333-333333333333",
        name: "Alice",
        is_muted: false,
        invite_only: false,
        private: true,
        unread_count: 2,
      },
    ]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith("/api/messenger/v1", "/streams/");
  });

  it("keeps UUID-only gateway stream rows", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          name: "general",
          description: "Main",
          invite_only: false,
          announce: false,
          private: false,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        is_muted: false,
        invite_only: false,
        private: false,
        unread_count: 0,
      },
    ]);
  });
});

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
const CURRENT_USER_UUID = "00000000-0000-0000-0000-000000000001";
const STREAM_UUID = "b4460c02-d693-4564-8804-98059613b86e";
const OTHER_STREAM_UUID = "7a2d1d10-5998-4df8-9241-92524b592fb7";
const TOPIC_UUID = "7a83bf8f-3ad0-4d68-b5e6-f3bf637bd650";
const OTHER_TOPIC_UUID = "f44274ce-6b70-4e8c-a0d9-d56951d6f3b1";

describe("createPrivateMessageStream", () => {
  it("posts stream then peer binding without user_uuid on stream create", async () => {
    mockMessengerApi.postJsonWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: STREAM_UUID,
          name: "Alice Smith",
          description: "",
          invite_only: false,
          announce: false,
          private: true,
        },
        raw: { statusText: "Created" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: "2dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
          stream_uuid: STREAM_UUID,
          user_uuid: PEER_UUID,
          role: "owner",
        },
        raw: { statusText: "Created" },
      });

    await expect(
      createPrivateMessageStream({ userUuid: PEER_UUID, displayName: "Alice Smith" }),
    ).resolves.toEqual({
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });

    expect(mockMessengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/messenger/v1",
      "/streams/",
      {
        private: true,
        name: "Alice Smith",
        description: "",
        source_name: "native",
        source: { kind: "native" },
      },
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/messenger/v1",
      "/stream_bindings/",
      {
        stream_uuid: STREAM_UUID,
        user_uuid: PEER_UUID,
        role: "owner",
      },
    );
  });

  it("returns null when peer binding fails after stream create", async () => {
    mockMessengerApi.postJsonWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: STREAM_UUID,
          name: "Alice Smith",
          description: "",
          private: true,
        },
        raw: { statusText: "Created" },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: { msg: "binding failed" },
        raw: { statusText: "Bad Request" },
      });

    await expect(
      createPrivateMessageStream({ userUuid: PEER_UUID, displayName: "Alice Smith" }),
    ).resolves.toBeNull();
  });
});

describe("resolveOrCreateDirectMessageStream", () => {
  it("reuses existing private stream through peer stream binding", async () => {
    mockMessengerApi.getWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [
          {
            uuid: STREAM_UUID,
            name: "Alice Smith",
            description: "",
            user_uuid: CURRENT_USER_UUID,
            invite_only: false,
            announce: false,
            private: true,
          },
        ],
        raw: { statusText: "OK" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [
          {
            uuid: "2dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
            stream_uuid: STREAM_UUID,
            user_uuid: PEER_UUID,
            role: "owner",
          },
        ],
        raw: { statusText: "OK" },
      });

    await expect(resolveOrCreateDirectMessageStream(PEER_UUID, "Alice Smith")).resolves.toEqual({
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("creates private stream when none exists for peer", async () => {
    mockMyStreamsResponse([]);
    mockMessengerApi.postJsonWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: STREAM_UUID,
          name: "Alice Smith",
          description: "",
          private: true,
        },
        raw: { statusText: "Created" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: "2dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
          stream_uuid: STREAM_UUID,
          user_uuid: PEER_UUID,
          role: "owner",
        },
        raw: { statusText: "Created" },
      });

    await expect(resolveOrCreateDirectMessageStream(PEER_UUID, "Alice Smith")).resolves.toEqual({
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(2);
  });
});

describe("findPrivateStreamForUserUuid", () => {
  it("matches private stream rows through peer stream binding", () => {
    const match = findPrivateStreamForUserUuid(
      [
        {
          uuid: STREAM_UUID,
          stream_uuid: STREAM_UUID,
          name: "Alice Smith",
          description: "",
          user_uuid: CURRENT_USER_UUID,
          invite_only: false,
          announce: false,
          private: true,
        },
      ],
      PEER_UUID,
      [{ stream_uuid: STREAM_UUID, user_uuid: PEER_UUID }],
    );
    expect(match?.stream_uuid).toBe(STREAM_UUID);
  });
});

describe("fetchStreamMembers", () => {
  it("returns bound user UUIDs for a stream", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        { stream_uuid: STREAM_UUID, user_uuid: PEER_UUID },
        { stream_uuid: OTHER_STREAM_UUID, user_uuid: CURRENT_USER_UUID },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamMembers(STREAM_UUID)).resolves.toEqual([PEER_UUID]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/stream_bindings/",
    );
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
  it("returns topic names for a stream UUID", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        { uuid: TOPIC_UUID, stream_uuid: STREAM_UUID, name: "planning" },
        { uuid: OTHER_TOPIC_UUID, stream_uuid: STREAM_UUID, name: "release" },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchTopics(STREAM_UUID)).resolves.toEqual(["planning", "release"]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/stream_topics/",
      { stream_uuid: STREAM_UUID },
      undefined,
    );
  });

  it("drops topic rows without a UUID, stream UUID, or non-empty name", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        { uuid: TOPIC_UUID, stream_uuid: STREAM_UUID, name: "" },
        { uuid: OTHER_TOPIC_UUID, stream_uuid: STREAM_UUID, name: "release" },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamTopicNames(STREAM_UUID)).resolves.toEqual(["release"]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/stream_topics/",
      { stream_uuid: STREAM_UUID },
      undefined,
    );
  });

  it("returns empty array when topics endpoint is not ok", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 500,
      data: { result: "error" },
      raw: { statusText: "Server Error" },
    });

    await expect(fetchStreamTopicNames(STREAM_UUID)).resolves.toEqual([]);
  });

  it("returns empty array when topics endpoint responds with error result", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "error",
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamTopicNames(STREAM_UUID)).resolves.toEqual([]);
  });

  it("returns empty array when stream UUID is invalid", async () => {
    await expect(fetchTopics("not-a-uuid")).resolves.toEqual([]);
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });

  it("throws when stream UUID is blank", async () => {
    await expect(fetchTopics("   ")).rejects.toThrow(
      /fetchTopics\.streamUuid must be a non-empty string/,
    );
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchStreams — uses Workspace gateway /streams
// ---------------------------------------------------------------------------

describe("fetchStreams", () => {
  it("returns mapped non-private streams", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          name: "general",
          description: "Main",
          announce: true,
          invite_only: false,
          private: false,
        },
        {
          uuid: "33333333-3333-4333-8333-333333333333",
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
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        description: "Main",
        is_announcement_only: true,
        invite_only: false,
      },
    ]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith("/api/messenger/v1", "/streams/");
  });

  it("returns empty list when gateway rows only contain private streams", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "33333333-3333-4333-8333-333333333333",
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

  it("uses row uuid as stream_uuid", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          name: "general",
          description: "Main",
          announce: false,
          invite_only: false,
          private: false,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchStreams()).resolves.toEqual([
      {
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        description: "Main",
        is_announcement_only: false,
        invite_only: false,
      },
    ]);
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
      updateStream(STREAM_UUID, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/streams/${STREAM_UUID}`, {
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

    await expect(updateStream(STREAM_UUID, { isArchived: false })).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/streams/${STREAM_UUID}`, {
      is_archived: "false",
    });
  });

  it("short-circuits when PATCH body would be empty", async () => {
    await expect(updateStream(STREAM_UUID, {})).resolves.toBe(true);
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("returns false when stream update API is not ok", async () => {
    mockMessengerApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(STREAM_UUID, { name: "platform" })).resolves.toBe(false);
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

    await expect(unarchiveStream(STREAM_UUID)).resolves.toEqual({ ok: true });
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/streams/${STREAM_UUID}`, {
      is_archived: "false",
    });
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

    await expect(unarchiveStream(STREAM_UUID)).resolves.toEqual(
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

    await expect(unarchiveStream(STREAM_UUID)).resolves.toEqual({
      ok: false,
      kind: "forbidden",
      status: 403,
      message: "Not allowed",
      code: "FORBIDDEN",
    });
  });
});

describe("deleteStream", () => {
  it("deletes stream by UUID", async () => {
    mockMessengerApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteStream(STREAM_UUID)).resolves.toBe(true);
    expect(mockMessengerApi.delete).toHaveBeenCalledWith(`/streams/${STREAM_UUID}`, undefined);
  });

  it("returns false on delete failure", async () => {
    mockMessengerApi.delete.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteStream(STREAM_UUID)).resolves.toBe(false);
  });
});

describe("deleteTopic", () => {
  it("deletes topic by topic UUID through workspace API", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(TOPIC_UUID)).resolves.toEqual({
      ok: true,
      complete: true,
      attempts: 1,
    });
    expect(mockMessengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_topics/${TOPIC_UUID}`,
    );
  });

  it("returns invalid_topic_uuid before calling the API", async () => {
    await expect(deleteTopic("not-a-uuid")).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 0,
      errorCode: "invalid_topic_uuid",
    });
    expect(mockMessengerApi.deleteWithBase).not.toHaveBeenCalled();
  });

  it("returns authorization error from API payload", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", code: "UNAUTHORIZED_PRINCIPAL" },
      raw: { statusText: "OK" },
    });

    await expect(deleteTopic(TOPIC_UUID)).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "UNAUTHORIZED_PRINCIPAL",
    });
  });

  it("returns http error for non-ok response", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad Request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteTopic(TOPIC_UUID)).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "http_400",
    });
  });

  it("returns network_error on request failure", async () => {
    mockMessengerApi.deleteWithBase.mockRejectedValue(new Error("offline"));

    await expect(deleteTopic(TOPIC_UUID)).resolves.toEqual({
      ok: false,
      complete: false,
      attempts: 1,
      errorCode: "network_error",
    });
  });
});

// ---------------------------------------------------------------------------
// addReaction — authenticated POST with guard
