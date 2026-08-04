import { beforeEach, describe, expect, it } from "vitest";
import { restoreMessengerStream, useMessengerStore } from "./messenger.model";
import type {
  MessengerFolder,
  MessengerFolderItem,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
} from "./messenger.types";

const OWNER_KEY = "account-a:instance-a:organization-a:project-a";
const OTHER_OWNER_KEY = "account-b:instance-b:organization-b:project-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const USER_A = "11111111-1111-4111-8111-111111111111";
const BINDING_A = "dff7201e-5120-422d-ac5a-3cbe596dd71b";
const BINDING_B = "3ba0d6e2-b7cd-4e70-90f8-89b202f8d1e7";
const BINDING_C = "7c1ce67c-2ec3-4e1b-9380-458bd8c607f2";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_B = "b0af81f7-703c-486f-b23d-cf02083aec0a";
const FOLDER_C = "d88993ec-e109-4a98-bdd1-8ba036374ee0";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const FOLDER_ITEM_C = "aee58fa0-8ab8-47ba-ae52-b504cfb383d9";
const FOLDER_ITEM_D = "33a78fcf-24df-45f7-9fc5-349b10014baf";
const DATE = "2026-06-22T10:10:00Z";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";

function createStreamBinding(
  overrides: Partial<MessengerStreamBinding> = {},
): MessengerStreamBinding {
  return {
    uuid: BINDING_A,
    projectId: PROJECT_A,
    streamUuid: STREAM_A,
    userUuid: USER_A,
    whoUuid: USER_A,
    role: "member",
    notificationMode: "all_messages",
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_A,
    projectId: PROJECT_A,
    ownerUuid: USER_A,
    userUuid: USER_A,
    role: "member",
    notificationMode: "all_messages",
    name: "Stream",
    description: "",
    unreadCount: 8,
    sourceName: "native",
    source: { kind: "native" },
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
  };
}

function createFolderItem(overrides: Partial<MessengerFolderItem> = {}): MessengerFolderItem {
  return {
    uuid: FOLDER_ITEM_A,
    projectId: PROJECT_A,
    folderUuid: FOLDER_A,
    userUuid: USER_A,
    streamUuid: STREAM_A,
    conversationId: `stream:${STREAM_A}`,
    chatType: "stream",
    orderIndex: 10,
    pinnedAt: null,
    unreadCount: 3,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createFolder(overrides: Partial<MessengerFolder> = {}): MessengerFolder {
  return {
    uuid: FOLDER_A,
    title: "Folder",
    backgroundColorValue: null,
    unreadCount: 3,
    systemType: "created",
    items: [createFolderItem()],
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: TOPIC_A,
    projectId: PROJECT_A,
    streamUuid: STREAM_A,
    userUuid: USER_A,
    name: "Topic",
    unreadCount: 0,
    notificationMode: "default",
    isDone: false,
    isDefault: false,
    lastMessageUuid: null,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

describe("messenger store", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
  });

  it("removes a stream binding from id and stream indexes for the current owner only", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B, streamUuid: STREAM_B }),
      ]);

    useMessengerStore
      .getState()
      .removeStreamBinding(OTHER_OWNER_KEY, { uuid: BINDING_A, streamUuid: STREAM_A });

    expect(useMessengerStore.getState().streamBindingIds).toEqual([BINDING_A, BINDING_B]);

    useMessengerStore
      .getState()
      .removeStreamBinding(OWNER_KEY, { uuid: BINDING_A, streamUuid: STREAM_A });

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toMatchObject({ uuid: BINDING_B });
    expect(state.streamBindingIds).toEqual([BINDING_B]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_B]).toEqual([BINDING_B]);
  });

  it("removes stream folder items and recalculates unread totals", () => {
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, {
      streams: [createStream(), createStream({ uuid: STREAM_B, unreadCount: 2 })],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [
        createFolder({
          unreadCount: 5,
          items: [
            createFolderItem(),
            createFolderItem({
              uuid: FOLDER_ITEM_B,
              streamUuid: STREAM_B,
              conversationId: `stream:${STREAM_B}`,
              unreadCount: 2,
            }),
          ],
        }),
      ],
    });

    useMessengerStore.getState().removeStream(OWNER_KEY, { uuid: STREAM_A });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 2,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_B })],
      }),
    );
  });

  it("blocks late child projections until a stream.created restore", () => {
    const store = useMessengerStore.getState();
    store.startBootstrap(OWNER_KEY);
    store.replaceBootstrapState(OWNER_KEY, {
      streams: [createStream()],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [createFolder()],
    });
    store.removeStream(OWNER_KEY, { uuid: STREAM_A });

    store.upsertTopic(OWNER_KEY, createTopic());
    store.upsertStreamBindings(OWNER_KEY, [createStreamBinding()]);
    store.applyFolderSnapshot(OWNER_KEY, createFolder());

    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBeUndefined();
    expect(useMessengerStore.getState().streamBindingsById[BINDING_A]).toBeUndefined();
    expect(useMessengerStore.getState().foldersById[FOLDER_A]?.items).toEqual([]);

    restoreMessengerStream(OWNER_KEY, STREAM_A);
    store.upsertStream(OWNER_KEY, createStream());
    store.upsertTopic(OWNER_KEY, createTopic());

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toBeDefined();
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBeDefined();
  });

  it("preserves server folder snapshots when no items are removed", () => {
    const store = useMessengerStore.getState();
    store.upsertStream(OWNER_KEY, createStream());
    const snapshotWithEmptyRemovalSet = createFolder({
      unreadCount: 9,
      items: [createFolderItem({ unreadCount: 1 })],
    });

    store.applyFolderSnapshot(OWNER_KEY, snapshotWithEmptyRemovalSet);

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toBe(snapshotWithEmptyRemovalSet);

    store.removeStream(OWNER_KEY, { uuid: STREAM_B });
    const snapshotWithUnrelatedRemoval = createFolder({
      unreadCount: 10,
      items: [createFolderItem({ unreadCount: 1 })],
      updatedAt: "2026-06-22T10:11:00Z",
    });

    store.applyFolderSnapshot(OWNER_KEY, snapshotWithUnrelatedRemoval);

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toBe(snapshotWithUnrelatedRemoval);
  });

  it("replaces stream bindings for one stream and removes stale bindings from that stream", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B }),
      ]);

    useMessengerStore
      .getState()
      .replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, [
        createStreamBinding({ uuid: BINDING_C }),
      ]);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_C]).toMatchObject({ uuid: BINDING_C });
    expect(state.streamBindingIds).toEqual([BINDING_C]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([BINDING_C]);
    expect(state.streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("replaces stream bindings without removing bindings from another stream", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B, streamUuid: STREAM_B }),
      ]);

    useMessengerStore.getState().replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, []);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toMatchObject({ uuid: BINDING_B });
    expect(state.streamBindingIds).toEqual([BINDING_B]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_B]).toEqual([BINDING_B]);
  });

  it("clears old stream bindings on an empty replacement and marks the stream as loaded", () => {
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [createStreamBinding()]);

    useMessengerStore.getState().replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, []);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingIds).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("projects a stream unread snapshot into every matching folder item", () => {
    useMessengerStore.getState().replaceFolderSnapshots(OWNER_KEY, [
      createFolder({
        items: [
          createFolderItem(),
          createFolderItem({
            uuid: FOLDER_ITEM_B,
            streamUuid: STREAM_B,
            conversationId: `stream:${STREAM_B}`,
            unreadCount: 4,
          }),
        ],
        unreadCount: 7,
      }),
      createFolder({
        uuid: FOLDER_B,
        items: [
          createFolderItem({
            uuid: FOLDER_ITEM_C,
            folderUuid: FOLDER_B,
            unreadCount: 2,
          }),
        ],
        unreadCount: 2,
      }),
    ]);

    useMessengerStore.getState().upsertStream(OWNER_KEY, createStream());

    const state = useMessengerStore.getState();
    expect(state.foldersById[FOLDER_A]?.items).toEqual([
      expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 8 }),
      expect.objectContaining({ uuid: FOLDER_ITEM_B, unreadCount: 4 }),
    ]);
    expect(state.foldersById[FOLDER_A]?.unreadCount).toBe(12);
    expect(state.foldersById[FOLDER_B]?.items).toEqual([
      expect.objectContaining({ uuid: FOLDER_ITEM_C, unreadCount: 8 }),
    ]);
    expect(state.foldersById[FOLDER_B]?.unreadCount).toBe(8);
  });

  it("uses active unread for folder totals while preserving raw and passive item counts", () => {
    useMessengerStore.getState().replaceFolderSnapshots(OWNER_KEY, [
      createFolder({
        items: [
          createFolderItem({
            unreadCount: 7,
            activeUnreadCount: 2,
            passiveUnreadCount: 5,
          }),
        ],
        unreadCount: 2,
      }),
    ]);

    useMessengerStore
      .getState()
      .upsertStream(
        OWNER_KEY,
        createStream({ unreadCount: 9, activeUnreadCount: 3, passiveUnreadCount: 6 }),
      );

    const folder = useMessengerStore.getState().foldersById[FOLDER_A];
    expect(folder?.unreadCount).toBe(3);
    expect(folder?.items[0]).toMatchObject({
      unreadCount: 9,
      activeUnreadCount: 3,
      passiveUnreadCount: 6,
    });
  });

  it("preserves unaffected folders and is idempotent for the same unread snapshot", () => {
    const unaffectedFolder = createFolder({
      uuid: FOLDER_C,
      items: [
        createFolderItem({
          uuid: FOLDER_ITEM_D,
          folderUuid: FOLDER_C,
          streamUuid: STREAM_B,
          conversationId: `stream:${STREAM_B}`,
        }),
      ],
    });
    useMessengerStore
      .getState()
      .replaceFolderSnapshots(OWNER_KEY, [createFolder(), unaffectedFolder]);

    useMessengerStore.getState().upsertStream(OWNER_KEY, createStream());
    const firstState = useMessengerStore.getState();
    const firstMatchingFolder = firstState.foldersById[FOLDER_A];
    const firstUnaffectedFolder = firstState.foldersById[FOLDER_C];

    useMessengerStore.getState().upsertStream(OWNER_KEY, createStream());
    const secondState = useMessengerStore.getState();

    expect(secondState.foldersById[FOLDER_A]).toBe(firstMatchingFolder);
    expect(secondState.foldersById[FOLDER_C]).toBe(firstUnaffectedFolder);
    expect(secondState.foldersById[FOLDER_C]).toBe(unaffectedFolder);
  });

  it("projects a zero stream unread count without changing other stream items", () => {
    useMessengerStore.getState().replaceFolderSnapshots(OWNER_KEY, [
      createFolder({
        items: [
          createFolderItem(),
          createFolderItem({
            uuid: FOLDER_ITEM_B,
            streamUuid: STREAM_B,
            conversationId: `stream:${STREAM_B}`,
            unreadCount: 4,
          }),
        ],
        unreadCount: 7,
      }),
    ]);

    useMessengerStore.getState().upsertStream(OWNER_KEY, createStream({ unreadCount: 0 }));

    const folder = useMessengerStore.getState().foldersById[FOLDER_A];
    expect(folder?.items).toEqual([
      expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 0 }),
      expect.objectContaining({ uuid: FOLDER_ITEM_B, unreadCount: 4 }),
    ]);
    expect(folder?.unreadCount).toBe(4);
  });

  it("does not project a stream snapshot for another owner", () => {
    useMessengerStore.getState().replaceFolderSnapshots(OWNER_KEY, [createFolder()]);
    const before = useMessengerStore.getState();

    useMessengerStore.getState().upsertStream(OTHER_OWNER_KEY, createStream({ unreadCount: 20 }));

    const after = useMessengerStore.getState();
    expect(after).toBe(before);
    expect(after.foldersById[FOLDER_A]?.unreadCount).toBe(3);
    expect(after.streamsById[STREAM_A]).toBeUndefined();
  });
});
