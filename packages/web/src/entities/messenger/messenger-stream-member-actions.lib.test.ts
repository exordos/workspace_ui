import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerStreamBindingDto,
} from "~/shared/api/messenger.types";
import {
  addWorkspaceStreamMembers,
  removeWorkspaceStreamMember,
} from "./messenger-stream-member-actions.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStream } from "./messenger.types";

const OWNER_KEY =
  "account:account-a:instance:instance-a:organization:org-a:project:project-a:user:11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const USER_C_UUID = "44444444-4444-4444-8444-444444444444";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const BINDING_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const SECOND_BINDING_UUID = "b891dc5a-94c4-4b40-b7f3-d24da53a13a5";
const DATE = "2026-06-22T10:10:00Z";

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  organizationOrigin: "https://workspace.example.com",
  projectId: "project-a",
  userUuid: CURRENT_USER_UUID,
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
};

function createStreamBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: BINDING_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    user_uuid: USER_B_UUID,
    who_uuid: CURRENT_USER_UUID,
    role: "member",
    notification_mode: "all_messages",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function seedStream(overrides: Partial<MessengerStream> = {}): void {
  useMessengerStore.getState().upsertStream(OWNER_KEY, {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: CURRENT_USER_UUID,
    userUuid: CURRENT_USER_UUID,
    role: "owner",
    notificationMode: "all_messages",
    name: "General",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  });
}

describe("messenger stream member actions", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    seedStream();
  });

  it("adds users through Workspace add_users with the member role body", async () => {
    const addStreamUsers = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerAddStreamBindingsRequestBody,
      ) =>
        Promise.resolve([
          createStreamBindingDto(),
          createStreamBindingDto({
            uuid: SECOND_BINDING_UUID,
            user_uuid: USER_C_UUID,
          }),
        ]),
    );

    await addWorkspaceStreamMembers({
      runtimeContext,
      streamUuid: STREAM_UUID,
      userUuids: [` ${USER_B_UUID} `, USER_C_UUID, USER_B_UUID],
      client: { addStreamUsers },
    });

    expect(addStreamUsers).toHaveBeenCalledWith(
      expect.objectContaining<Partial<MessengerClientOptions>>({
        accessToken: "access-token",
        devTargetOrigin: "https://workspace.example.com",
        projectId: "project-a",
      }),
      STREAM_UUID,
      {
        member: [USER_B_UUID, USER_C_UUID],
      },
    );
  });

  it("upserts adapted stream bindings after add succeeds", async () => {
    const addStreamUsers = vi.fn(() =>
      Promise.resolve([
        createStreamBindingDto(),
        createStreamBindingDto({
          uuid: SECOND_BINDING_UUID,
          user_uuid: USER_C_UUID,
        }),
      ]),
    );

    await expect(
      addWorkspaceStreamMembers({
        runtimeContext,
        streamUuid: STREAM_UUID,
        userUuids: [USER_B_UUID, USER_C_UUID],
        client: { addStreamUsers },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: OWNER_KEY,
      streamUuid: STREAM_UUID,
      bindings: [
        expect.objectContaining({ uuid: BINDING_UUID, userUuid: USER_B_UUID }),
        expect.objectContaining({ uuid: SECOND_BINDING_UUID, userUuid: USER_C_UUID }),
      ],
    });

    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_UUID]).toEqual([
      BINDING_UUID,
      SECOND_BINDING_UUID,
    ]);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toEqual(
      expect.objectContaining({ streamUuid: STREAM_UUID, userUuid: USER_B_UUID }),
    );
  });

  it("sends the nil UUID for admin and applies the returned membership", async () => {
    const adminUuid = "00000000-0000-0000-0000-000000000000";
    const addStreamUsers = vi.fn(() =>
      Promise.resolve([createStreamBindingDto({ user_uuid: adminUuid })]),
    );

    await expect(
      addWorkspaceStreamMembers({
        runtimeContext,
        streamUuid: STREAM_UUID,
        userUuids: [adminUuid],
        client: { addStreamUsers },
      }),
    ).resolves.toMatchObject({ status: "applied" });

    expect(addStreamUsers).toHaveBeenCalledWith(expect.anything(), STREAM_UUID, {
      member: [adminUuid],
    });
    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]?.userUuid).toBe(adminUuid);
  });

  it.each(["member", "administrator", "owner"] as const)(
    "rejects member addition by a non-owner even with the %s binding role",
    async (role) => {
      seedStream({ ownerUuid: USER_B_UUID, role });
      const addStreamUsers = vi.fn(() => Promise.resolve([]));

      await expect(
        addWorkspaceStreamMembers({
          runtimeContext,
          streamUuid: STREAM_UUID,
          userUuids: [USER_C_UUID],
          client: { addStreamUsers },
        }),
      ).rejects.toMatchObject({ code: "not-stream-owner" });
      expect(addStreamUsers).not.toHaveBeenCalled();
    },
  );

  it.each(["missing-stream", "other-catalog"] as const)(
    "rejects member addition with %s ownership data before making a request",
    async (condition) => {
      if (condition === "missing-stream") useMessengerStore.setState({ streamsById: {} });
      else useMessengerStore.setState({ ownerKey: "other-owner" });
      const addStreamUsers = vi.fn(() => Promise.resolve([]));

      await expect(
        addWorkspaceStreamMembers({
          runtimeContext,
          streamUuid: STREAM_UUID,
          userUuids: [USER_C_UUID],
          client: { addStreamUsers },
        }),
      ).rejects.toMatchObject({ code: "not-stream-owner" });
      expect(addStreamUsers).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid member UUIDs before the add request", async () => {
    const addStreamUsers = vi.fn(() => Promise.resolve([]));

    await expect(
      addWorkspaceStreamMembers({
        runtimeContext,
        streamUuid: STREAM_UUID,
        userUuids: ["123"],
        client: { addStreamUsers },
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceStreamMemberActionError",
      code: "invalid-user-uuid",
    });

    expect(addStreamUsers).not.toHaveBeenCalled();
  });

  it("removes a stream binding through Workspace API and removes it from the store", async () => {
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [
      {
        uuid: BINDING_UUID,
        projectId: PROJECT_UUID,
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: CURRENT_USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    const deleteStreamBinding = vi.fn((_options: MessengerClientOptions, _bindingUuid: string) =>
      Promise.resolve(),
    );

    await expect(
      removeWorkspaceStreamMember({
        runtimeContext,
        streamUuid: STREAM_UUID,
        bindingUuid: BINDING_UUID,
        userUuid: USER_B_UUID,
        client: { deleteStreamBinding },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: OWNER_KEY,
      streamUuid: STREAM_UUID,
      removedBindingUuid: BINDING_UUID,
    });

    expect(deleteStreamBinding).toHaveBeenCalledWith(
      expect.objectContaining<Partial<MessengerClientOptions>>({
        accessToken: "access-token",
        devTargetOrigin: "https://workspace.example.com",
        projectId: "project-a",
      }),
      BINDING_UUID,
    );
    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toBeUndefined();
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_UUID]).toEqual([]);
  });

  it("allows self-remove through Workspace API and removes it from the store", async () => {
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [
      {
        uuid: BINDING_UUID,
        projectId: PROJECT_UUID,
        streamUuid: STREAM_UUID,
        userUuid: CURRENT_USER_UUID,
        whoUuid: CURRENT_USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    const deleteStreamBinding = vi.fn((_options: MessengerClientOptions, _bindingUuid: string) =>
      Promise.resolve(),
    );

    await expect(
      removeWorkspaceStreamMember({
        runtimeContext,
        streamUuid: STREAM_UUID,
        bindingUuid: BINDING_UUID,
        userUuid: CURRENT_USER_UUID,
        client: { deleteStreamBinding },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: OWNER_KEY,
      streamUuid: STREAM_UUID,
      removedBindingUuid: BINDING_UUID,
    });

    expect(deleteStreamBinding).toHaveBeenCalledWith(expect.any(Object), BINDING_UUID);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toBeUndefined();
  });

  it("surfaces backend errors without changing the store", async () => {
    const backendError = new Error("Backend rejected stream binding delete");
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [
      {
        uuid: BINDING_UUID,
        projectId: PROJECT_UUID,
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: CURRENT_USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    const deleteStreamBinding = vi.fn(() => Promise.reject(backendError));

    await expect(
      removeWorkspaceStreamMember({
        runtimeContext,
        streamUuid: STREAM_UUID,
        bindingUuid: BINDING_UUID,
        userUuid: USER_B_UUID,
        client: { deleteStreamBinding },
      }),
    ).rejects.toBe(backendError);

    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toBeDefined();
  });

  it("skips add result without writing stale runtime responses", async () => {
    const addStreamUsers = vi.fn(() => Promise.resolve([createStreamBindingDto()]));
    const getRuntimeContext = vi
      .fn<() => WorkspaceRuntimeContext | null>()
      .mockReturnValueOnce(runtimeContext)
      .mockReturnValueOnce(null);

    await expect(
      addWorkspaceStreamMembers({
        runtimeContext,
        getRuntimeContext,
        streamUuid: STREAM_UUID,
        userUuids: [USER_B_UUID],
        client: { addStreamUsers },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey: OWNER_KEY,
      reason: "stale-owner",
    });

    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toBeUndefined();
  });

  it("skips remove result without writing stale runtime responses", async () => {
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [
      {
        uuid: BINDING_UUID,
        projectId: PROJECT_UUID,
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: CURRENT_USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    const deleteStreamBinding = vi.fn(() => Promise.resolve());
    const getRuntimeContext = vi
      .fn<() => WorkspaceRuntimeContext | null>()
      .mockReturnValueOnce(runtimeContext)
      .mockReturnValueOnce(null);

    await expect(
      removeWorkspaceStreamMember({
        runtimeContext,
        getRuntimeContext,
        streamUuid: STREAM_UUID,
        bindingUuid: BINDING_UUID,
        userUuid: USER_B_UUID,
        client: { deleteStreamBinding },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey: OWNER_KEY,
      reason: "stale-owner",
    });

    expect(useMessengerStore.getState().streamBindingsById[BINDING_UUID]).toBeDefined();
  });
});
