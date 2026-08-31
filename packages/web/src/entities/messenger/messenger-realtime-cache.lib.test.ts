import { describe, expect, it, vi } from "vitest";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import {
  applyMessengerRealtimeEventToCache,
  type MessengerRealtimeCacheWriter,
} from "./messenger-realtime-cache.lib";

const OWNER_KEY = "account:a:org:o:project:p:user:u";
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const BINDING_UUID = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const FOLDER_UUID = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_UUID = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FILE_UUID = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const DATE = "2026-08-19T10:10:00Z";

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    topic_uuid: TOPIC_UUID,
    author_uuid: USER_UUID,
    payload: { kind: "markdown", content: "Hello" },
    user_uuid: USER_UUID,
    read: false,
    pinned: false,
    starred: false,
    is_own: false,
    reactions: {},
    reaction_users: {},
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createStreamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
    uuid: STREAM_UUID,
    project_id: PROJECT_UUID,
    owner: USER_UUID,
    user_uuid: USER_UUID,
    role: "member",
    notification_mode: "all_messages",
    name: "Engineering",
    description: "",
    unread_count: 2,
    active_unread_count: 2,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: BINDING_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    user_uuid: USER_UUID,
    who_uuid: USER_UUID,
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
    uuid: TOPIC_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    user_uuid: USER_UUID,
    name: "General",
    unread_count: 2,
    active_unread_count: 2,
    passive_unread_count: 0,
    is_default: false,
    is_done: false,
    notification_mode: "default",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createFolderDto(
  overrides: Partial<WorkspaceMessengerFolderDto> = {},
): WorkspaceMessengerFolderDto {
  return {
    uuid: FOLDER_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    title: "Inbox",
    background_color_value: null,
    unread_count: 2,
    system_type: "created",
    folder_items: [
      {
        uuid: FOLDER_ITEM_UUID,
        project_id: PROJECT_UUID,
        folder_uuid: FOLDER_UUID,
        user_uuid: USER_UUID,
        stream_uuid: STREAM_UUID,
        chat_type: "stream",
        order_index: 10,
        pinned_at: null,
        unread_count: 2,
        active_unread_count: 2,
        passive_unread_count: 0,
        created_at: DATE,
        updated_at: DATE,
      },
    ],
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createWriter(
  overrides: Partial<MessengerRealtimeCacheWriter> = {},
): MessengerRealtimeCacheWriter {
  return {
    advanceReadBoundary: vi.fn(),
    markCachedMessagesRead: vi.fn(),
    patchCachedMessage: vi.fn(),
    deleteCachedMessage: vi.fn(),
    writeConversationMessagePage: vi.fn(),
    upsertCachedStream: vi.fn(),
    deleteCachedStream: vi.fn(),
    upsertCachedStreamBindings: vi.fn(),
    deleteCachedStreamBinding: vi.fn(),
    upsertCachedTopic: vi.fn(),
    deleteCachedTopic: vi.fn(),
    upsertCachedFolder: vi.fn(),
    deleteCachedFolder: vi.fn(),
    deleteCachedFolderItem: vi.fn(),
    writeRealtimeCursor: vi.fn(),
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

interface MappingCase {
  name: string;
  event: WorkspaceRealtimeEvent;
  assertMutation: (writer: MessengerRealtimeCacheWriter) => void;
}

const mappingCases: MappingCase[] = [
  {
    name: "treats a kind-less message as created and writes both conversation pages",
    event: { epoch_version: 1, type: "message", message: createMessageDto() },
    assertMutation: (writer) => {
      expect(writer.writeConversationMessagePage).toHaveBeenCalledTimes(2);
      expect(writer.writeConversationMessagePage).toHaveBeenNthCalledWith(
        1,
        OWNER_KEY,
        `stream:${STREAM_UUID}`,
        expect.objectContaining({ source: "realtime" }),
      );
      expect(writer.writeConversationMessagePage).toHaveBeenNthCalledWith(
        2,
        OWNER_KEY,
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
        expect.objectContaining({ source: "realtime" }),
      );
    },
  },
  {
    name: "patches message.updated",
    event: {
      epoch_version: 2,
      type: "message",
      kind: "message.updated",
      message: createMessageDto({ payload: { kind: "markdown", content: "Updated" } }),
    },
    assertMutation: (writer) => {
      expect(writer.patchCachedMessage).toHaveBeenCalledWith(
        OWNER_KEY,
        expect.objectContaining({
          uuid: MESSAGE_UUID,
          payload: { kind: "markdown", content: "Updated" },
        }),
      );
    },
  },
  {
    name: "patches message.read and advances its boundary",
    event: {
      epoch_version: 3,
      type: "message",
      kind: "message.read",
      message: createMessageDto(),
    },
    assertMutation: (writer) => {
      expect(writer.patchCachedMessage).toHaveBeenCalledWith(
        OWNER_KEY,
        expect.objectContaining({ uuid: MESSAGE_UUID, read: true }),
      );
      expect(writer.advanceReadBoundary).toHaveBeenCalledWith({
        ownerKey: OWNER_KEY,
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        createdAt: DATE,
        messageUuid: MESSAGE_UUID,
        epochVersion: 3,
      });
    },
  },
  {
    name: "marks the exact messages.read UUIDs",
    event: {
      epoch_version: 4,
      type: "messages",
      kind: "messages.read",
      messageUuids: [MESSAGE_UUID, FILE_UUID],
    },
    assertMutation: (writer) => {
      expect(writer.markCachedMessagesRead).toHaveBeenCalledWith(OWNER_KEY, [
        MESSAGE_UUID,
        FILE_UUID,
      ]);
    },
  },
  {
    name: "deletes a message from stream and topic conversations",
    event: {
      epoch_version: 5,
      type: "message",
      kind: "message.deleted",
      message: { uuid: MESSAGE_UUID, stream_uuid: STREAM_UUID, topic_uuid: TOPIC_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedMessage).toHaveBeenCalledWith(OWNER_KEY, MESSAGE_UUID, [
        `stream:${STREAM_UUID}`,
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      ]);
    },
  },
  ...(["stream.created", "stream.updated", "stream.read"] as const).map((kind, index) => ({
    name: `upserts ${kind}`,
    event: {
      epoch_version: 10 + index,
      type: "stream" as const,
      kind,
      stream: createStreamDto(),
    },
    assertMutation: (writer: MessengerRealtimeCacheWriter) => {
      expect(writer.upsertCachedStream).toHaveBeenCalledWith(
        OWNER_KEY,
        expect.objectContaining({ uuid: STREAM_UUID, name: "Engineering" }),
      );
    },
  })),
  {
    name: "deletes stream.deleted",
    event: {
      epoch_version: 13,
      type: "stream",
      kind: "stream.deleted",
      stream: { uuid: STREAM_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedStream).toHaveBeenCalledWith(OWNER_KEY, STREAM_UUID);
    },
  },
  {
    name: "upserts stream_bindings.created",
    event: {
      epoch_version: 14,
      type: "stream_binding",
      kind: "stream_bindings.created",
      stream_uuid: STREAM_UUID,
      stream_bindings: [createBindingDto()],
    },
    assertMutation: (writer) => {
      expect(writer.upsertCachedStreamBindings).toHaveBeenCalledWith(OWNER_KEY, [
        expect.objectContaining({ uuid: BINDING_UUID, streamUuid: STREAM_UUID }),
      ]);
    },
  },
  {
    name: "upserts stream_binding.updated",
    event: {
      epoch_version: 15,
      type: "stream_binding",
      kind: "stream_binding.updated",
      stream_binding: createBindingDto(),
    },
    assertMutation: (writer) => {
      expect(writer.upsertCachedStreamBindings).toHaveBeenCalledWith(OWNER_KEY, [
        expect.objectContaining({ uuid: BINDING_UUID, streamUuid: STREAM_UUID }),
      ]);
    },
  },
  {
    name: "deletes stream_binding.deleted",
    event: {
      epoch_version: 16,
      type: "stream_binding",
      kind: "stream_binding.deleted",
      stream_binding: { uuid: BINDING_UUID, stream_uuid: STREAM_UUID, user_uuid: USER_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedStreamBinding).toHaveBeenCalledWith(OWNER_KEY, BINDING_UUID);
    },
  },
  ...(["topic.created", "topic.updated", "topic.read"] as const).map((kind, index) => ({
    name: `upserts ${kind}`,
    event: {
      epoch_version: 20 + index,
      type: "topic" as const,
      kind,
      topic: createTopicDto(),
    },
    assertMutation: (writer: MessengerRealtimeCacheWriter) => {
      expect(writer.upsertCachedTopic).toHaveBeenCalledWith(
        OWNER_KEY,
        expect.objectContaining({ uuid: TOPIC_UUID, streamUuid: STREAM_UUID }),
      );
    },
  })),
  {
    name: "deletes topic.deleted",
    event: {
      epoch_version: 23,
      type: "topic",
      kind: "topic.deleted",
      topic: { uuid: TOPIC_UUID, stream_uuid: STREAM_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedTopic).toHaveBeenCalledWith(OWNER_KEY, TOPIC_UUID, STREAM_UUID);
    },
  },
  ...(["folder.created", "folder.updated"] as const).map((kind, index) => ({
    name: `upserts ${kind}`,
    event: {
      epoch_version: 30 + index,
      type: "folder" as const,
      kind,
      folder: createFolderDto(),
    },
    assertMutation: (writer: MessengerRealtimeCacheWriter) => {
      expect(writer.upsertCachedFolder).toHaveBeenCalledWith(
        OWNER_KEY,
        expect.objectContaining({ uuid: FOLDER_UUID, title: "Inbox" }),
      );
    },
  })),
  {
    name: "deletes folder.deleted",
    event: {
      epoch_version: 32,
      type: "folder",
      kind: "folder.deleted",
      folder: { uuid: FOLDER_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedFolder).toHaveBeenCalledWith(OWNER_KEY, FOLDER_UUID);
    },
  },
  {
    name: "deletes folder_item.deleted",
    event: {
      epoch_version: 33,
      type: "folder_item",
      kind: "folder_item.deleted",
      folder_item: { uuid: FOLDER_ITEM_UUID },
    },
    assertMutation: (writer) => {
      expect(writer.deleteCachedFolderItem).toHaveBeenCalledWith(OWNER_KEY, FOLDER_ITEM_UUID);
    },
  },
];

describe("messenger realtime cache mapper", () => {
  it.each(mappingCases)("$name", async ({ event, assertMutation }) => {
    const writer = createWriter();

    const status = await applyMessengerRealtimeEventToCache({
      event,
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => true,
    });

    expect(status).toBe("applied");
    assertMutation(writer);
    expect(writer.writeRealtimeCursor).toHaveBeenCalledTimes(1);
    expect(writer.writeRealtimeCursor).toHaveBeenCalledWith(OWNER_KEY, event.epoch_version);
  });

  it.each(["file.created", "file.updated"] as const)(
    "defers %s without cache writes",
    async (kind) => {
      const writer = createWriter();
      const event: WorkspaceRealtimeEvent = {
        epoch_version: 40,
        type: "file",
        kind,
        file: {
          uuid: FILE_UUID,
          project_id: PROJECT_UUID,
          user_uuid: USER_UUID,
          stream_uuid: STREAM_UUID,
          name: "brief.txt",
          description: "Brief",
          content_type: "text/plain",
          size_bytes: 5,
          hash: "file-hash",
          created_at: DATE,
          updated_at: DATE,
        },
      };

      const status = await applyMessengerRealtimeEventToCache({
        event,
        ownerKey: OWNER_KEY,
        writer,
        isWriteCurrent: () => true,
      });

      expect(status).toBe("deferred");
      expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
    },
  );

  it("defers file.deleted without cache writes", async () => {
    const writer = createWriter();

    const status = await applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 41,
        type: "file",
        kind: "file.deleted",
        file: { uuid: FILE_UUID, stream_uuid: STREAM_UUID },
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => true,
    });

    expect(status).toBe("deferred");
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("defers external operation events without cache writes", async () => {
    const writer = createWriter();

    const status = await applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 42,
        type: "external_operation",
        kind: "external_operation.updated",
        external_operation: { uuid: MESSAGE_UUID, status: "succeeded" },
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => true,
    });

    expect(status).toBe("deferred");
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("writes the cursor only after both created-message pages finish", async () => {
    const firstPage = deferred<void>();
    const secondPage = deferred<void>();
    const writeConversationMessagePage = vi
      .fn<MessengerRealtimeCacheWriter["writeConversationMessagePage"]>()
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const writer = createWriter({ writeConversationMessagePage });

    const result = applyMessengerRealtimeEventToCache({
      event: { epoch_version: 50, type: "message", message: createMessageDto() },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => true,
    });

    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
    firstPage.resolve();
    await Promise.resolve();
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
    secondPage.resolve();

    await expect(result).resolves.toBe("applied");
    expect(writer.writeRealtimeCursor).toHaveBeenCalledWith(OWNER_KEY, 50);
  });

  it("defers the cursor when the write becomes stale during mutation", async () => {
    const mutation = deferred<void>();
    let current = true;
    const writer = createWriter({ patchCachedMessage: () => mutation.promise });
    const result = applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 51,
        type: "message",
        kind: "message.updated",
        message: createMessageDto(),
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => current,
    });

    current = false;
    mutation.resolve();

    await expect(result).resolves.toBe("deferred");
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("stops a multi-step read mutation when its owner becomes stale", async () => {
    const messagePatch = deferred<void>();
    let current = true;
    const writer = createWriter({ patchCachedMessage: () => messagePatch.promise });
    const result = applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 52,
        type: "message",
        kind: "message.read",
        message: createMessageDto(),
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => current,
    });

    current = false;
    messagePatch.resolve();

    await expect(result).resolves.toBe("deferred");
    expect(writer.advanceReadBoundary).not.toHaveBeenCalled();
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("does not mutate when the initial write guard is stale", async () => {
    const writer = createWriter();

    const status = await applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 53,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto(),
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => false,
    });

    expect(status).toBe("deferred");
    expect(writer.upsertCachedStream).not.toHaveBeenCalled();
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("does not write the cursor when a domain mutation rejects", async () => {
    const failure = new Error("cache write failed");
    const writer = createWriter({ patchCachedMessage: () => Promise.reject(failure) });
    const result = applyMessengerRealtimeEventToCache({
      event: {
        epoch_version: 54,
        type: "message",
        kind: "message.updated",
        message: createMessageDto(),
      },
      ownerKey: OWNER_KEY,
      writer,
      isWriteCurrent: () => true,
    });

    await expect(result).rejects.toBe(failure);
    expect(writer.writeRealtimeCursor).not.toHaveBeenCalled();
  });
});
