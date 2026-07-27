import { beforeEach, describe, expect, it } from "vitest";
import { useExternalChatsStore } from "./external-chat.model";
import type { ExternalChat } from "./external-chat.types";

const ACCOUNT_UUID = "account-a";
const OTHER_ACCOUNT_UUID = "account-b";
const CHAT_UUID = "chat-a";
const SCOPE_KEY = "owner-a:external-account:account-a";
const OTHER_SCOPE_KEY = "owner-a:external-account:account-b";

function chat(revision: number): ExternalChat {
  return {
    uuid: CHAT_UUID,
    externalAccountUuid: ACCOUNT_UUID,
    type: "channel",
    displayName: `Support r${revision}`,
    selected: true,
    projectId: "project-a",
    projectionStreamUuid: null,
    status: "syncing",
    safeError: null,
    transitionPending: false,
    revision,
    updatedAt: "2026-07-24T10:00:00Z",
  };
}

describe("external chat store revision ordering", () => {
  beforeEach(() => {
    useExternalChatsStore.getState().clear();
  });

  it("does not let a late GET replace a newer websocket snapshot", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.upsert(SCOPE_KEY, ACCOUNT_UUID, chat(3));

    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [chat(2)]);

    expect(useExternalChatsStore.getState().chats).toEqual([chat(3)]);
  });

  it("does not resurrect a websocket deletion from a late GET or POST snapshot", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.remove(SCOPE_KEY, ACCOUNT_UUID, CHAT_UUID, 4);

    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [chat(3)]);
    store.upsert(SCOPE_KEY, ACCOUNT_UUID, chat(3));

    expect(useExternalChatsStore.getState().chats).toEqual([]);
    expect(useExternalChatsStore.getState().tombstones[CHAT_UUID]).toBe(4);
  });

  it("clear removes tombstones so the next authoritative REST snapshot can hydrate", () => {
    const store = useExternalChatsStore.getState();
    store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.remove(SCOPE_KEY, ACCOUNT_UUID, CHAT_UUID, 4);
    const generationBeforeClear = useExternalChatsStore.getState().authoritativeResetGeneration;

    store.clear();
    const loadGeneration = useExternalChatsStore.getState().start(SCOPE_KEY, ACCOUNT_UUID);
    useExternalChatsStore.getState().replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [chat(3)]);

    const state = useExternalChatsStore.getState();
    expect(state.chats).toEqual([chat(3)]);
    expect(state.tombstones).toEqual({});
    expect(state.authoritativeResetGeneration).toBe(generationBeforeClear + 1);
  });

  it("preserves ordering metadata when the same scope starts another GET", () => {
    const store = useExternalChatsStore.getState();
    store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.remove(SCOPE_KEY, ACCOUNT_UUID, CHAT_UUID, 4);

    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [chat(3)]);

    expect(useExternalChatsStore.getState().chats).toEqual([]);
    expect(useExternalChatsStore.getState().tombstones[CHAT_UUID]).toBe(4);
  });

  it("isolates ordering metadata when switching account scopes", () => {
    const store = useExternalChatsStore.getState();
    store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.remove(SCOPE_KEY, ACCOUNT_UUID, CHAT_UUID, 4);

    store.start(OTHER_SCOPE_KEY, OTHER_ACCOUNT_UUID);

    const state = useExternalChatsStore.getState();
    expect(state.externalAccountUuid).toBe(OTHER_ACCOUNT_UUID);
    expect(state.latestRevisions).toEqual({});
    expect(state.tombstones).toEqual({});
  });

  it("removes an unchanged baseline chat that is absent from the GET response", () => {
    const store = useExternalChatsStore.getState();
    const initialLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, initialLoad, [chat(1)]);
    const refreshLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);

    store.replace(SCOPE_KEY, ACCOUNT_UUID, refreshLoad, []);

    expect(useExternalChatsStore.getState().chats).toEqual([]);
  });

  it("preserves a websocket-created chat that was not in the GET baseline", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.upsert(SCOPE_KEY, ACCOUNT_UUID, chat(2));

    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, []);

    expect(useExternalChatsStore.getState().chats).toEqual([chat(2)]);
  });

  it("preserves a websocket-updated baseline chat that is absent from the GET response", () => {
    const store = useExternalChatsStore.getState();
    const initialLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, initialLoad, [chat(1)]);
    const refreshLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.upsert(SCOPE_KEY, ACCOUNT_UUID, chat(2));

    store.replace(SCOPE_KEY, ACCOUNT_UUID, refreshLoad, []);

    expect(useExternalChatsStore.getState().chats).toEqual([chat(2)]);
  });

  it("ignores an older overlapping GET response after the newer load completes", () => {
    const store = useExternalChatsStore.getState();
    const olderLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);
    const newerLoad = store.start(SCOPE_KEY, ACCOUNT_UUID);

    expect(store.replace(SCOPE_KEY, ACCOUNT_UUID, newerLoad, [chat(3)])).toBe(true);
    expect(store.replace(SCOPE_KEY, ACCOUNT_UUID, olderLoad, [chat(2)])).toBe(false);

    expect(useExternalChatsStore.getState().chats).toEqual([chat(3)]);
  });
});
