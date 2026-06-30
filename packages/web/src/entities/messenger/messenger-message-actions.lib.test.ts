import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  sendMessengerMessage,
} from "./messenger-message-actions.lib";
import { selectMessengerMessagesForConversation, useMessengerStore } from "./messenger.model";

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
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-06-22T10:10:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    topic_uuid: TOPIC_A,
    author_uuid: USER_A,
    payload: {
      kind: "markdown",
      content: "Hello, workspace",
    },
    user_uuid: USER_A,
    read: false,
    pinned: false,
    starred: false,
    is_own: true,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useMessengerStore.getState().startBootstrap(ownerKey);
  return ownerKey;
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

describe("messenger message actions", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
  });

  it("creates a markdown message and indexes it into topic and stream buckets", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const createMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _body: WorkspaceMessengerCreateMessageRequestBody,
      ): Promise<WorkspaceMessengerMessageDto> => Promise.resolve(createMessageDto()),
    );

    await expect(
      sendMessengerMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "Hello, workspace",
        includeStreamConversation: true,
        client: { createMessage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      message: expect.objectContaining({ uuid: MESSAGE_A, markdown: "Hello, workspace" }),
    });

    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a", projectId: PROJECT_A }),
      {
        stream_uuid: STREAM_A,
        topic_uuid: TOPIC_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      },
    );
    expect(
      selectMessengerMessagesForConversation(useMessengerStore.getState(), `stream:${STREAM_A}`),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectMessengerMessagesForConversation(
        useMessengerStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
  });

  it("skips stale edit results after the runtime owner changes", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 2,
    });
    const ownerKey = prepareStoreOwner(runtimeA);
    useMessengerStore
      .getState()
      .indexMessageIntoConversationBuckets(ownerKey, adaptMessengerMessage(createMessageDto()));
    const editRequest = createDeferred<WorkspaceMessengerMessageDto>();
    const editMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _messageUuid: string,
        _body: WorkspaceMessengerUpdateMessageRequestBody,
      ) => editRequest.promise,
    );
    const actionPromise = editMessengerMessage({
      runtimeContext: runtimeA,
      getRuntimeContext: () => runtimeB,
      messageUuid: MESSAGE_A,
      markdown: "Edited",
      client: { editMessage },
    });

    editRequest.resolve(createMessageDto({ payload: { kind: "markdown", content: "Edited" } }));

    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().messagesById[MESSAGE_A]?.markdown).not.toBe("Edited");
  });

  it("deletes and marks messages as read through Workspace actions", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    await sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "Hello, workspace",
      includeStreamConversation: true,
      client: { createMessage: () => Promise.resolve(createMessageDto()) },
    });

    await markMessengerMessageRead({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      conversationIds: [`topic:${STREAM_A}:${TOPIC_A}`],
      client: { markMessageRead: () => Promise.resolve(createMessageDto({ read: true })) },
    });

    expect(useMessengerStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);

    const deleteMessage = vi.fn(() => Promise.resolve());
    await deleteMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      client: { deleteMessage },
    });

    expect(deleteMessage).toHaveBeenCalledWith(expect.any(Object), MESSAGE_A);
    expect(useMessengerStore.getState().ownerKey).toBe(ownerKey);
    expect(useMessengerStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
  });
});
