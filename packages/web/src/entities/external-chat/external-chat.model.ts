import { create } from "zustand";
import type { ExternalChat, ExternalChatLoadStatus } from "./external-chat.types";

interface ExternalChatsState {
  scopeKey: string | null;
  externalAccountUuid: string | null;
  chats: ExternalChat[];
  latestRevisions: Record<string, number>;
  tombstones: Record<string, number>;
  loadGeneration: number;
  activeLoad: {
    generation: number;
    baselineRevisions: Record<string, number>;
    baselineMembership: string[];
  } | null;
  authoritativeResetGeneration: number;
  loadStatus: ExternalChatLoadStatus;
  error: string | null;
  start: (scopeKey: string, externalAccountUuid: string) => number;
  replace: (
    scopeKey: string,
    externalAccountUuid: string,
    loadGeneration: number,
    chats: ExternalChat[],
  ) => boolean;
  upsert: (scopeKey: string, externalAccountUuid: string, chat: ExternalChat) => boolean;
  remove: (
    scopeKey: string,
    externalAccountUuid: string,
    chatUuid: string,
    revision: number,
  ) => boolean;
  fail: (
    scopeKey: string,
    externalAccountUuid: string,
    loadGeneration: number,
    error: string,
  ) => boolean;
  clearAccount: (scopeKey: string, externalAccountUuid: string) => ExternalChat[];
  clear: () => void;
}

function withoutRevision(
  revisions: Record<string, number>,
  chatUuid: string,
): Record<string, number> {
  const next = { ...revisions };
  delete next[chatUuid];
  return next;
}

export const useExternalChatsStore = create<ExternalChatsState>((set) => ({
  scopeKey: null,
  externalAccountUuid: null,
  chats: [],
  latestRevisions: {},
  tombstones: {},
  loadGeneration: 0,
  activeLoad: null,
  authoritativeResetGeneration: 0,
  loadStatus: "idle",
  error: null,
  start(scopeKey, externalAccountUuid) {
    let generation = 0;
    set((state) => {
      generation = state.loadGeneration + 1;
      const isSameScope =
        state.scopeKey === scopeKey && state.externalAccountUuid === externalAccountUuid;
      const chats = isSameScope ? state.chats : [];
      return {
        scopeKey,
        externalAccountUuid,
        chats,
        latestRevisions: isSameScope ? state.latestRevisions : {},
        tombstones: isSameScope ? state.tombstones : {},
        loadGeneration: generation,
        activeLoad: {
          generation,
          baselineRevisions: Object.fromEntries(chats.map((chat) => [chat.uuid, chat.revision])),
          baselineMembership: chats.map((chat) => chat.uuid),
        },
        loadStatus: "loading",
        error: null,
      };
    });
    return generation;
  },
  replace(scopeKey, externalAccountUuid, loadGeneration, chats) {
    let applied = false;
    set((state) => {
      if (
        state.scopeKey !== scopeKey ||
        state.externalAccountUuid !== externalAccountUuid ||
        state.activeLoad?.generation !== loadGeneration
      ) {
        return state;
      }
      applied = true;
      let nextChats = state.chats;
      let nextLatestRevisions = state.latestRevisions;
      let nextTombstones = state.tombstones;
      for (const chat of chats) {
        if (chat.externalAccountUuid !== externalAccountUuid) continue;
        const current = nextChats.find((item) => item.uuid === chat.uuid);
        const latestRevision = Math.max(
          current?.revision ?? 0,
          nextLatestRevisions[chat.uuid] ?? 0,
        );
        const tombstoneRevision = nextTombstones[chat.uuid] ?? 0;
        if (chat.revision < latestRevision || chat.revision <= tombstoneRevision) continue;

        nextChats =
          current == null
            ? [...nextChats, chat]
            : nextChats.map((item) => (item.uuid === chat.uuid ? chat : item));
        nextLatestRevisions = { ...nextLatestRevisions, [chat.uuid]: chat.revision };
        if (tombstoneRevision > 0) {
          nextTombstones = withoutRevision(nextTombstones, chat.uuid);
        }
      }
      const responseUuids = new Set(
        chats
          .filter((chat) => chat.externalAccountUuid === externalAccountUuid)
          .map((chat) => chat.uuid),
      );
      for (const chatUuid of state.activeLoad.baselineMembership) {
        if (responseUuids.has(chatUuid)) continue;
        const baselineRevision = state.activeLoad.baselineRevisions[chatUuid];
        const current = nextChats.find((chat) => chat.uuid === chatUuid);
        const latestRevision = nextLatestRevisions[chatUuid] ?? current?.revision;
        const tombstoneRevision = nextTombstones[chatUuid];
        const isUnchangedSinceStart =
          baselineRevision != null &&
          current?.revision === baselineRevision &&
          latestRevision === baselineRevision &&
          tombstoneRevision == null;
        if (isUnchangedSinceStart) {
          nextChats = nextChats.filter((chat) => chat.uuid !== chatUuid);
        }
      }
      return {
        chats: nextChats,
        latestRevisions: nextLatestRevisions,
        tombstones: nextTombstones,
        activeLoad: null,
        loadStatus: "ready",
        error: null,
      };
    });
    return applied;
  },
  upsert(scopeKey, externalAccountUuid, chat) {
    let applied = false;
    set((state) => {
      if (
        state.scopeKey !== scopeKey ||
        state.externalAccountUuid !== externalAccountUuid ||
        chat.externalAccountUuid !== externalAccountUuid
      ) {
        return state;
      }
      const current = state.chats.find((item) => item.uuid === chat.uuid);
      const latestRevision = Math.max(
        current?.revision ?? 0,
        state.latestRevisions[chat.uuid] ?? 0,
      );
      const tombstoneRevision = state.tombstones[chat.uuid] ?? 0;
      if (chat.revision < latestRevision || chat.revision <= tombstoneRevision) return state;
      applied = true;
      return {
        chats:
          current == null
            ? [...state.chats, chat]
            : state.chats.map((item) => (item.uuid === chat.uuid ? chat : item)),
        latestRevisions: { ...state.latestRevisions, [chat.uuid]: chat.revision },
        tombstones: withoutRevision(state.tombstones, chat.uuid),
        loadStatus: "ready",
        error: null,
      };
    });
    return applied;
  },
  remove(scopeKey, externalAccountUuid, chatUuid, revision) {
    let applied = false;
    set((state) => {
      if (state.scopeKey !== scopeKey || state.externalAccountUuid !== externalAccountUuid) {
        return state;
      }
      const current = state.chats.find((chat) => chat.uuid === chatUuid);
      if (current != null && current.externalAccountUuid !== externalAccountUuid) return state;
      const latestRevision = Math.max(
        current?.revision ?? 0,
        state.latestRevisions[chatUuid] ?? 0,
        state.tombstones[chatUuid] ?? 0,
      );
      if (revision < latestRevision) return state;
      applied = true;
      return {
        chats: state.chats.filter((chat) => chat.uuid !== chatUuid),
        latestRevisions: { ...state.latestRevisions, [chatUuid]: revision },
        tombstones: { ...state.tombstones, [chatUuid]: revision },
        loadStatus: "ready",
        error: null,
      };
    });
    return applied;
  },
  fail(scopeKey, externalAccountUuid, loadGeneration, error) {
    let applied = false;
    set((state) => {
      if (
        state.scopeKey !== scopeKey ||
        state.externalAccountUuid !== externalAccountUuid ||
        state.activeLoad?.generation !== loadGeneration
      ) {
        return state;
      }
      applied = true;
      return { activeLoad: null, loadStatus: "error", error };
    });
    return applied;
  },
  clearAccount(scopeKey, externalAccountUuid) {
    let removedChats: ExternalChat[] = [];
    set((state) => {
      if (state.scopeKey !== scopeKey || state.externalAccountUuid !== externalAccountUuid) {
        return state;
      }
      removedChats = state.chats;
      return {
        scopeKey: null,
        externalAccountUuid: null,
        chats: [],
        latestRevisions: {},
        tombstones: {},
        loadGeneration: state.loadGeneration + 1,
        activeLoad: null,
        authoritativeResetGeneration: state.authoritativeResetGeneration + 1,
        loadStatus: "idle",
        error: null,
      };
    });
    return removedChats;
  },
  clear() {
    set((state) => ({
      scopeKey: null,
      externalAccountUuid: null,
      chats: [],
      latestRevisions: {},
      tombstones: {},
      loadGeneration: state.loadGeneration + 1,
      activeLoad: null,
      authoritativeResetGeneration: state.authoritativeResetGeneration + 1,
      loadStatus: "idle",
      error: null,
    }));
  },
}));
