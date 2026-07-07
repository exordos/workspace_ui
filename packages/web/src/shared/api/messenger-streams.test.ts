/**
 * Tests for Messenger API (messenger-streams module).
 */
import { describe, expect, it } from "vitest";
// messenger.test.setup must load before the module under test so its vi.mock hooks register first.
import { getMockMessengerApi } from "./messenger.test.setup";
// eslint-disable-next-line import-x/order -- keep setup import above module import for vi.mock registration
import {
  addMembersToStream,
  archiveStream,
  createPrivateMessageStream,
  createWorkspaceStream,
  deleteStream,
  deleteStreamBinding,
  deleteTopic,
  fetchStreamMembers,
  fetchStreamTopicNames,
  fetchStreamTopics,
  fetchStreams,
  fetchSubscriptions,
  fetchTopics,
  findPrivateStreamForUserUuid,
  resolveOrCreateDirectMessageStream,
  unarchiveStream,
  toggleStreamTopicDone,
  updateStream,
  updateStreamBindingRole,
  updateStreamTopic,
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
          is_archived: true,
          source_name: "zulip",
          source: { kind: "zulip", server_url: "https://zulip.example", stream_id: 42 },
          color: 0x123456,
          unread_count: 5,
          notification_mode: "mentions_only",
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
          notification_mode: "muted",
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        notification_mode: "mentions_only",
        invite_only: false,
        private: false,
        is_archived: true,
        source_name: "zulip",
        source: { kind: "zulip", server_url: "https://zulip.example", stream_id: 42 },
        color: 0x123456,
        unread_count: 5,
      },
      {
        stream_uuid: "33333333-3333-4333-8333-333333333333",
        name: "Alice",
        notification_mode: "muted",
        invite_only: false,
        private: true,
        is_archived: false,
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
          is_archived: false,
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      {
        stream_uuid: "11111111-1111-4111-8111-111111111111",
        name: "general",
        notification_mode: "all_messages",
        invite_only: false,
        private: false,
        is_archived: false,
        unread_count: 0,
      },
    ]);
  });
});

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
const CURRENT_PEER_UUID = "00000000-0000-0000-0000-000000000001";
const MEMBER_UUID = "00000000-0000-0000-0000-000000000003";
const STREAM_UUID = "b4460c02-d693-4564-8804-98059613b86e";
const OTHER_STREAM_UUID = "7a2d1d10-5998-4df8-9241-92524b592fb7";
const TOPIC_UUID = "7a83bf8f-3ad0-4d68-b5e6-f3bf637bd650";
const OTHER_TOPIC_UUID = "f44274ce-6b70-4e8c-a0d9-d56951d6f3b1";

describe("createPrivateMessageStream", () => {
  it("posts direct_user_uuid and lets backend create private bindings", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        uuid: STREAM_UUID,
        name: "Alice Smith",
        description: "",
        invite_only: false,
        announce: false,
        private: true,
        unread_count: 0,
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
        name: "Alice Smith",
        description: "",
        source_name: "native",
        source: { kind: "native" },
        direct_user_uuid: PEER_UUID,
      },
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(1);
  });

  it("returns null when direct stream creation fails", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { msg: "direct user invalid" },
      raw: { statusText: "Bad Request" },
    });

    await expect(
      createPrivateMessageStream({ userUuid: PEER_UUID, displayName: "Alice Smith" }),
    ).resolves.toBeNull();
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkspaceStream", () => {
  it("posts a native stream and adds selected members through stream action", async () => {
    mockMessengerApi.postJsonWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: STREAM_UUID,
          name: "engineering",
          description: "Engineering workspace",
          user_uuid: CURRENT_PEER_UUID,
          invite_only: true,
          announce: false,
          private: false,
          unread_count: 0,
        },
        raw: { statusText: "Created" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: [
          {
            uuid: "2dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
            stream_uuid: STREAM_UUID,
            user_uuid: PEER_UUID,
            role: "member",
          },
          {
            uuid: "3dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
            stream_uuid: STREAM_UUID,
            user_uuid: MEMBER_UUID,
            role: "member",
          },
        ],
        raw: { statusText: "Created" },
      });

    await expect(
      createWorkspaceStream({
        name: "engineering",
        description: "Engineering workspace",
        inviteOnly: true,
        announce: false,
        private: false,
        memberUserIds: [CURRENT_PEER_UUID, PEER_UUID, MEMBER_UUID],
      }),
    ).resolves.toEqual({
      streamUuid: STREAM_UUID,
      name: "engineering",
      boundUserIds: [PEER_UUID, MEMBER_UUID],
    });

    expect(mockMessengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/messenger/v1",
      "/streams/",
      {
        name: "engineering",
        description: "Engineering workspace",
        source_name: "native",
        source: { kind: "native" },
        invite_only: true,
        announce: false,
        private: false,
      },
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}/actions/add_users/invoke`,
      {
        member: [PEER_UUID, MEMBER_UUID],
      },
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(2);
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("returns null when a member binding fails", async () => {
    mockMessengerApi.postJsonWithBase
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          uuid: STREAM_UUID,
          name: "engineering",
          description: "",
          private: false,
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
      createWorkspaceStream({
        name: "engineering",
        memberUserIds: [PEER_UUID],
      }),
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
            user_uuid: CURRENT_PEER_UUID,
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
    mockMessengerApi.postJsonWithBase.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        uuid: STREAM_UUID,
        name: "Alice Smith",
        description: "",
        private: true,
      },
      raw: { statusText: "Created" },
    });

    await expect(resolveOrCreateDirectMessageStream(PEER_UUID, "Alice Smith")).resolves.toEqual({
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(1);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/streams/",
      {
        name: "Alice Smith",
        description: "",
        source_name: "native",
        source: { kind: "native" },
        direct_user_uuid: PEER_UUID,
      },
    );
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
          user_uuid: CURRENT_PEER_UUID,
          invite_only: false,
          announce: false,
          private: true,
          is_archived: false,
          unread_count: 0,
          notification_mode: "all_messages",
        },
      ],
      PEER_UUID,
      [
        {
          uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          stream_uuid: STREAM_UUID,
          user_uuid: PEER_UUID,
          role: "member",
        },
      ],
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
        {
          uuid: "11111111-1111-4111-8111-111111111111",
          stream_uuid: STREAM_UUID,
          user_uuid: PEER_UUID,
        },
        {
          uuid: "22222222-2222-4222-8222-222222222222",
          stream_uuid: OTHER_STREAM_UUID,
          user_uuid: CURRENT_PEER_UUID,
        },
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

describe("stream binding mutations", () => {
  const BINDING_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("deletes a stream binding through workspace API", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 204,
      data: {},
      raw: { statusText: "No Content" },
    });

    await expect(deleteStreamBinding(BINDING_UUID)).resolves.toBe(true);
    expect(mockMessengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_bindings/${BINDING_UUID}`,
    );
  });

  it("updates a stream binding role through workspace API", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: BINDING_UUID, role: "moderator" },
      raw: { statusText: "OK" },
    });

    await expect(updateStreamBindingRole(BINDING_UUID, "moderator")).resolves.toBe(true);
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_bindings/${BINDING_UUID}`,
      { role: "moderator" },
    );
  });
});

describe("addMembersToStream", () => {
  it("binds members to an existing stream through stream action", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: [
        {
          uuid: "2dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
          stream_uuid: STREAM_UUID,
          user_uuid: PEER_UUID,
          role: "member",
        },
        {
          uuid: "3dce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9",
          stream_uuid: STREAM_UUID,
          user_uuid: MEMBER_UUID,
          role: "member",
        },
      ],
      raw: { statusText: "Created" },
    });

    await expect(
      addMembersToStream({
        streamUuid: STREAM_UUID,
        streamName: "engineering",
        userIds: [PEER_UUID, MEMBER_UUID, PEER_UUID],
      }),
    ).resolves.toEqual({
      ok: true,
      addedUserIds: [PEER_UUID, MEMBER_UUID],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    expect(mockMessengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}/actions/add_users/invoke`,
      {
        member: [PEER_UUID, MEMBER_UUID],
      },
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(1);
  });

  it("returns success for an empty principal list", async () => {
    await expect(
      addMembersToStream({
        streamUuid: STREAM_UUID,
        streamName: "engineering",
        userIds: [],
      }),
    ).resolves.toEqual({
      ok: true,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    expect(mockMessengerApi.post).not.toHaveBeenCalled();
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("throws on invalid stream uuid (guard)", async () => {
    await expect(
      addMembersToStream({
        streamUuid: "   ",
        streamName: "engineering",
        userIds: [PEER_UUID],
      }),
    ).rejects.toThrow(/Invalid streamUuid/);
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

  it("keeps stream topic color from Workspace rows", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: TOPIC_UUID,
          stream_uuid: STREAM_UUID,
          name: "planning",
          color: 0xabcdef,
          source_name: "zulip",
          source: {
            kind: "zulip",
            server_url: "https://zulip.example",
            stream_id: 42,
            topic_name: "planning",
          },
        },
      ],
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamTopics(STREAM_UUID)).resolves.toEqual([
      expect.objectContaining({
        color: 0xabcdef,
        source_name: "zulip",
        source: {
          kind: "zulip",
          server_url: "https://zulip.example",
          stream_id: 42,
          topic_name: "planning",
        },
      }),
    ]);
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
          source_name: "zulip",
          source: { kind: "zulip", server_url: "https://zulip.example", stream_id: 42 },
          color: 0x654321,
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
        source_name: "zulip",
        source: { kind: "zulip", server_url: "https://zulip.example", stream_id: 42 },
        color: 0x654321,
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
// updateStream — uses Workspace stream resource updates
// ---------------------------------------------------------------------------
describe("updateStream", () => {
  it("puts stream name and description through the Workspace API", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: STREAM_UUID, name: "platform", description: "Platform discussions" },
      raw: { statusText: "OK" },
    });

    await expect(
      updateStream(STREAM_UUID, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}`,
      {
        name: "platform",
        description: "Platform discussions",
      },
    );
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("short-circuits when PUT body would be empty", async () => {
    await expect(updateStream(STREAM_UUID, {})).resolves.toBe(true);
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns false when stream update API is not ok", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(STREAM_UUID, { name: "platform" })).resolves.toBe(false);
  });
});

describe("deleteStream", () => {
  it("deletes a stream through workspace API", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 204,
      data: {},
      raw: { statusText: "No Content" },
    });

    await expect(deleteStream(STREAM_UUID)).resolves.toBe(true);
    expect(mockMessengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}`,
    );
  });
});

describe("archiveStream", () => {
  it("invokes the Workspace archive action", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: STREAM_UUID, is_archived: true },
      raw: { statusText: "OK" },
    });

    await expect(archiveStream(STREAM_UUID)).resolves.toBe(true);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}/actions/archive/invoke`,
      {},
    );
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });
});

describe("unarchiveStream", () => {
  it("invokes the Workspace unarchive action", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: STREAM_UUID, is_archived: false },
      raw: { statusText: "OK" },
    });

    await expect(unarchiveStream(STREAM_UUID)).resolves.toEqual({ ok: true });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/streams/${STREAM_UUID}/actions/unarchive/invoke`,
      {},
    );
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("maps HTTP failures to transient/forbidden kinds", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
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

describe("updateStreamTopic", () => {
  it("updates only changed topic fields through workspace API", async () => {
    const responseTopic = {
      uuid: TOPIC_UUID,
      stream_uuid: STREAM_UUID,
      name: "postmortem",
      unread_count: 3,
      is_default: false,
      is_done: false,
    };
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(updateStreamTopic({ topicUuid: TOPIC_UUID, name: "postmortem" })).resolves.toEqual(
      { ok: true, topic: { ...responseTopic, notification_mode: "default" } },
    );
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_topics/${TOPIC_UUID}`,
      { name: "postmortem" },
    );
  });

  it("updates stream assignment without sending unchanged name", async () => {
    const responseTopic = {
      uuid: TOPIC_UUID,
      stream_uuid: OTHER_STREAM_UUID,
      name: "incident",
      unread_count: 3,
      is_default: false,
      is_done: false,
    };
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(
      updateStreamTopic({ topicUuid: TOPIC_UUID, streamUuid: OTHER_STREAM_UUID }),
    ).resolves.toEqual({ ok: true, topic: { ...responseTopic, notification_mode: "default" } });
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_topics/${TOPIC_UUID}`,
      { stream_uuid: OTHER_STREAM_UUID },
    );
  });

  it("returns invalid_topic_uuid before calling the API", async () => {
    await expect(
      updateStreamTopic({ topicUuid: "not-a-uuid", streamUuid: STREAM_UUID, name: "postmortem" }),
    ).resolves.toEqual({ ok: false, topic: null, errorCode: "invalid_topic_uuid" });
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns http error for non-ok response", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad Request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(updateStreamTopic({ topicUuid: TOPIC_UUID, name: "postmortem" })).resolves.toEqual(
      { ok: false, topic: null, errorCode: "http_400" },
    );
  });
});

describe("toggleStreamTopicDone", () => {
  it("toggles server-owned topic done state through workspace action API", async () => {
    const responseTopic = {
      uuid: TOPIC_UUID,
      stream_uuid: STREAM_UUID,
      name: "incident",
      unread_count: 3,
      is_default: false,
      is_done: true,
    };
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(toggleStreamTopicDone(TOPIC_UUID)).resolves.toEqual({
      ok: true,
      topic: { ...responseTopic, notification_mode: "default" },
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/stream_topics/${TOPIC_UUID}/actions/toggle_done/invoke`,
      {},
    );
  });

  it("returns invalid_topic_uuid before calling the action API", async () => {
    await expect(toggleStreamTopicDone("not-a-uuid")).resolves.toEqual({
      ok: false,
      topic: null,
      errorCode: "invalid_topic_uuid",
    });
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addReaction — authenticated POST with guard
