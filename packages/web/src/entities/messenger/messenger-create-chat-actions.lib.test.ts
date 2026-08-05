import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerCreateStreamRequestBody,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import {
  createWorkspaceChannel,
  createWorkspaceDirectStream,
} from "./messenger-create-chat-actions.lib";
import { useMessengerStore } from "./messenger.model";

const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";
const INSTANCE_A = "instance-a";
const INSTANCE_B = "instance-b";
const ORGANIZATION_A = "organization-a";
const ORGANIZATION_B = "organization-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const USER_C = "55555555-5555-4555-8555-555555555555";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_A = "afc81ef6-9871-4cb0-b5e5-95765a73be80";
const STREAM_BINDING_A = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const DATE = "2026-06-22T10:10:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createStreamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
    uuid: STREAM_A,
    name: "Engineering",
    description: "Engineering workspace",
    project_id: PROJECT_A,
    owner: USER_A,
    user_uuid: USER_A,
    role: "owner",
    notification_mode: "all_messages",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    direct_user_uuid: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createStreamBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: STREAM_BINDING_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    user_uuid: USER_B,
    who_uuid: USER_A,
    role: "member",
    notification_mode: "all_messages",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createTopicDto(
  overrides: Partial<WorkspaceMessengerTopicDto> = {},
): WorkspaceMessengerTopicDto {
  return {
    uuid: TOPIC_A,
    project_id: PROJECT_A,
    name: "General Topic",
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    is_default: true,
    is_done: false,
    notification_mode: "default",
    last_message_uuid: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("messenger create chat actions", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
  });

  function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useMessengerStore.getState().startBootstrap(ownerKey);
    return ownerKey;
  }

  it("creates a native Workspace stream and stores the adapted stream", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const createStreamWithDefaultTopic = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateStreamRequestBody) =>
        Promise.resolve({
          stream: createStreamDto({ name: "Product" }),
          defaultTopic: createTopicDto(),
        }),
    );

    await expect(
      createWorkspaceChannel({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        name: "Product",
        description: "Roadmap",
        inviteOnly: true,
        announce: false,
        client: { createStreamWithDefaultTopic },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      stream: expect.objectContaining({ uuid: STREAM_A, name: "Product" }),
      defaultTopic: expect.objectContaining({
        uuid: TOPIC_A,
        streamUuid: STREAM_A,
        isDefault: true,
      }),
      streamBindings: [],
    });

    expect(createStreamWithDefaultTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        name: "Product",
        description: "Roadmap",
        source_name: "native",
        source: { kind: "native" },
        invite_only: true,
        announce: false,
      },
    );
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Product");
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        streamUuid: STREAM_A,
        isDefault: true,
      }),
    );
  });

  it("creates a direct private stream with direct_user_uuid and stores the default topic", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const createStreamWithDefaultTopic = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateStreamRequestBody) =>
        Promise.resolve({
          stream: createStreamDto({
            name: "Direct",
            private: true,
            direct_user_uuid: USER_B,
          }),
          defaultTopic: createTopicDto(),
        }),
    );

    await createWorkspaceDirectStream({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      directUserUuid: USER_B,
      client: { createStreamWithDefaultTopic },
    });

    expect(createStreamWithDefaultTopic).toHaveBeenCalledWith(expect.any(Object), {
      name: "Direct",
      description: "Private workspace",
      source_name: "native",
      source: { kind: "native" },
      direct_user_uuid: USER_B,
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        isPrivate: true,
        directUserUuid: USER_B,
      }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        streamUuid: STREAM_A,
        isDefault: true,
      }),
    );
  });

  it("adds selected channel members as member bindings after stream creation", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const createStreamWithDefaultTopic = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateStreamRequestBody) =>
        Promise.resolve({
          stream: createStreamDto(),
          defaultTopic: createTopicDto(),
        }),
    );
    const addStreamUsers = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerAddStreamBindingsRequestBody,
      ) =>
        Promise.resolve([
          createStreamBindingDto({ user_uuid: USER_B }),
          createStreamBindingDto({
            uuid: "b891dc5a-94c4-4b40-b7f3-d24da53a13a5",
            user_uuid: USER_C,
          }),
        ]),
    );

    const result = await createWorkspaceChannel({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      name: "Engineering",
      memberUserUuids: [USER_B, USER_A, USER_B, USER_C],
      client: { createStreamWithDefaultTopic, addStreamUsers },
    });

    expect(addStreamUsers).toHaveBeenCalledWith(expect.any(Object), STREAM_A, {
      member: [USER_B, USER_C],
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: "applied",
        defaultTopic: expect.objectContaining({ uuid: TOPIC_A, isDefault: true }),
        streamBindings: [
          expect.objectContaining({ userUuid: USER_B }),
          expect.objectContaining({ userUuid: USER_C }),
        ],
      }),
    );
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toHaveLength(2);
  });

  it("does not fake a default topic when stream creation does not return one", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const createStreamWithDefaultTopic = vi.fn(() =>
      Promise.reject(new TypeError(`Default topic was not returned for stream ${STREAM_A}`)),
    );

    await expect(
      createWorkspaceChannel({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        name: "Engineering",
        client: { createStreamWithDefaultTopic },
      }),
    ).rejects.toThrow("Default topic was not returned");

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toBeUndefined();
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBeUndefined();
    expect(useMessengerStore.getState().streamIds).toEqual([]);
    expect(useMessengerStore.getState().topicIds).toEqual([]);
  });

  it("skips store writes when owner becomes stale after fetching the default topic", async () => {
    let currentContext = createRuntimeContext();
    prepareStoreOwner(currentContext);
    const createStreamRequest = createDeferred<{
      stream: WorkspaceMessengerStreamDto;
      defaultTopic: WorkspaceMessengerTopicDto;
    }>();
    const createStreamWithDefaultTopic = vi.fn(() => createStreamRequest.promise);

    const action = createWorkspaceChannel({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      name: "Engineering",
      client: { createStreamWithDefaultTopic },
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 1,
    });
    createStreamRequest.resolve({
      stream: createStreamDto(),
      defaultTopic: createTopicDto(),
    });

    await expect(action).resolves.toEqual({
      status: "skipped",
      ownerKey: workspaceRuntimeOwnerKey(createRuntimeContext()),
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamIds).toEqual([]);
    expect(useMessengerStore.getState().topicIds).toEqual([]);
    expect(useMessengerStore.getState().streamBindingIds).toEqual([]);
  });
});
