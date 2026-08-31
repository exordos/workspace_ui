import { create } from "zustand";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";

export interface ActivityUnreadMention {
  uuid: string;
  streamUuid: string;
  topicUuid: string;
  createdAt: string;
}

export type ActivityUnreadMentionsStatus = "idle" | "loading" | "ready" | "error";

export type ActivityUnreadMentionMutation =
  | { kind: "upsert"; epochVersion: number; mention: ActivityUnreadMention }
  | { kind: "delete"; epochVersion: number; uuid: string }
  | {
      kind: "read-boundary";
      epochVersion: number;
      streamUuid: string;
      topicUuid: string;
      createdAt: string;
      uuid: string;
    }
  | { kind: "read-exact"; epochVersion: number; uuids: readonly string[] }
  | { kind: "clear-topic"; epochVersion: number; streamUuid: string; topicUuid: string }
  | { kind: "clear-stream"; epochVersion: number; streamUuid: string };

export type ActivityLiveMentionMessageMutation =
  | { kind: "upsert"; epochVersion: number; message: MessengerMessage }
  | { kind: "delete"; epochVersion: number; uuid: string };

interface LiveMentionMessagesState {
  liveMentionMessagesByUuid: Record<string, MessengerMessage>;
  liveMentionMessagesOwnerKey: string | null;
  liveMentionMessagesRuntimeGeneration: number | null;
  liveMentionMessagesLastEpochVersion: number | null;
}

interface UnreadMentionsIndexState {
  unreadMentionsByUuid: Record<string, ActivityUnreadMention>;
  unreadMentionsCount: number | null;
  unreadMentionsStatus: ActivityUnreadMentionsStatus;
  unreadMentionsRuntimeGeneration: number | null;
  unreadMentionsBootstrapToken: number | null;
  unreadMentionsBufferedMutations: readonly ActivityUnreadMentionMutation[];
  unreadMentionsLastEpochVersion: number | null;
}

export interface ActivityState extends UnreadMentionsIndexState, LiveMentionMessagesState {
  staleVersion: number;
  unreadMentionsOwnerKey: string | null;
  markStale: () => void;
  setUnreadMentionsOwner: (ownerKey: string | null) => void;
  startUnreadMentionsBootstrap: (ownerKey: string, runtimeGeneration: number) => number;
  finishUnreadMentionsBootstrap: (
    ownerKey: string,
    runtimeGeneration: number,
    token: number,
    mentions: readonly ActivityUnreadMention[],
  ) => boolean;
  failUnreadMentionsBootstrap: (ownerKey: string, runtimeGeneration: number, token: number) => void;
  invalidateUnreadMentions: (ownerKey: string) => void;
  applyUnreadMentionMutation: (
    ownerKey: string,
    runtimeGeneration: number,
    mutation: ActivityUnreadMentionMutation,
  ) => void;
  applyLiveMentionMessageMutation: (
    ownerKey: string,
    runtimeGeneration: number,
    mutation: ActivityLiveMentionMessageMutation,
  ) => void;
  clear: () => void;
}

let nextUnreadMentionsBootstrapToken = 0;

const emptyUnreadMentionsIndex: UnreadMentionsIndexState = {
  unreadMentionsByUuid: {},
  unreadMentionsCount: null,
  unreadMentionsStatus: "idle",
  unreadMentionsRuntimeGeneration: null,
  unreadMentionsBootstrapToken: null,
  unreadMentionsBufferedMutations: [],
  unreadMentionsLastEpochVersion: null,
};

const emptyLiveMentionMessages: LiveMentionMessagesState = {
  liveMentionMessagesByUuid: {},
  liveMentionMessagesOwnerKey: null,
  liveMentionMessagesRuntimeGeneration: null,
  liveMentionMessagesLastEpochVersion: null,
};

const EMPTY_LIVE_MENTION_MESSAGES_BY_UUID: Readonly<Record<string, MessengerMessage>> = {};

export function selectActivityLiveMentionMessages(
  state: ActivityState,
  ownerKey: string | null,
  runtimeGeneration: number | null,
): Readonly<Record<string, MessengerMessage>> {
  return ownerKey != null &&
    runtimeGeneration != null &&
    state.liveMentionMessagesOwnerKey === ownerKey &&
    state.liveMentionMessagesRuntimeGeneration === runtimeGeneration
    ? state.liveMentionMessagesByUuid
    : EMPTY_LIVE_MENTION_MESSAGES_BY_UUID;
}

interface UnreadMentionsMutationResult {
  unreadMentionsByUuid: Record<string, ActivityUnreadMention>;
  unreadMentionsCount: number;
}

function indexState(
  result: UnreadMentionsMutationResult,
  state: Omit<UnreadMentionsIndexState, "unreadMentionsByUuid" | "unreadMentionsCount">,
): UnreadMentionsIndexState {
  return {
    ...state,
    ...result,
  };
}

function compareMentionOrder(
  left: Pick<ActivityUnreadMention, "createdAt" | "uuid">,
  right: Pick<ActivityUnreadMention, "createdAt" | "uuid">,
): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  return createdAtOrder !== 0 ? createdAtOrder : left.uuid.localeCompare(right.uuid);
}

function removeUnreadMentionsWhere(
  mentions: Record<string, ActivityUnreadMention>,
  count: number,
  shouldRemove: (mention: ActivityUnreadMention) => boolean,
): UnreadMentionsMutationResult {
  let nextMentions: Record<string, ActivityUnreadMention> | null = null;
  let removedCount = 0;
  for (const mention of Object.values(mentions)) {
    if (!shouldRemove(mention)) continue;
    nextMentions ??= { ...mentions };
    delete nextMentions[mention.uuid];
    removedCount += 1;
  }
  return {
    unreadMentionsByUuid: nextMentions ?? mentions,
    unreadMentionsCount: count - removedCount,
  };
}

function applyUnreadMentionMutation(
  mentions: Record<string, ActivityUnreadMention>,
  count: number,
  mutation: ActivityUnreadMentionMutation,
): UnreadMentionsMutationResult {
  switch (mutation.kind) {
    case "upsert": {
      const previous = mentions[mutation.mention.uuid];
      return {
        unreadMentionsByUuid:
          previous === mutation.mention
            ? mentions
            : { ...mentions, [mutation.mention.uuid]: mutation.mention },
        unreadMentionsCount: previous == null ? count + 1 : count,
      };
    }
    case "delete": {
      if (mentions[mutation.uuid] == null) {
        return { unreadMentionsByUuid: mentions, unreadMentionsCount: count };
      }
      const nextMentions = { ...mentions };
      delete nextMentions[mutation.uuid];
      return { unreadMentionsByUuid: nextMentions, unreadMentionsCount: count - 1 };
    }
    case "read-boundary":
      return removeUnreadMentionsWhere(
        mentions,
        count,
        (mention) =>
          mention.streamUuid === mutation.streamUuid &&
          mention.topicUuid === mutation.topicUuid &&
          compareMentionOrder(mention, mutation) <= 0,
      );
    case "read-exact": {
      let nextMentions: Record<string, ActivityUnreadMention> | null = null;
      let removedCount = 0;
      for (const uuid of new Set(mutation.uuids)) {
        if (mentions[uuid] == null) continue;
        nextMentions ??= { ...mentions };
        delete nextMentions[uuid];
        removedCount += 1;
      }
      return {
        unreadMentionsByUuid: nextMentions ?? mentions,
        unreadMentionsCount: count - removedCount,
      };
    }
    case "clear-topic":
      return removeUnreadMentionsWhere(
        mentions,
        count,
        (mention) =>
          mention.streamUuid === mutation.streamUuid && mention.topicUuid === mutation.topicUuid,
      );
    case "clear-stream":
      return removeUnreadMentionsWhere(
        mentions,
        count,
        (mention) => mention.streamUuid === mutation.streamUuid,
      );
  }
}

function createUnreadMentionsIndex(
  mentions: readonly ActivityUnreadMention[],
): UnreadMentionsMutationResult {
  const unreadMentionsByUuid: Record<string, ActivityUnreadMention> = {};
  let unreadMentionsCount = 0;
  for (const mention of mentions) {
    if (unreadMentionsByUuid[mention.uuid] == null) unreadMentionsCount += 1;
    unreadMentionsByUuid[mention.uuid] = mention;
  }
  return { unreadMentionsByUuid, unreadMentionsCount };
}

function appendBufferedMutation(
  mutations: readonly ActivityUnreadMentionMutation[],
  mutation: ActivityUnreadMentionMutation,
): readonly ActivityUnreadMentionMutation[] {
  const previous = mutations.at(-1);
  if (
    previous != null &&
    (previous.kind === "upsert" || previous.kind === "delete") &&
    (mutation.kind === "upsert" || mutation.kind === "delete") &&
    (previous.kind === "upsert" ? previous.mention.uuid : previous.uuid) ===
      (mutation.kind === "upsert" ? mutation.mention.uuid : mutation.uuid)
  ) {
    return [...mutations.slice(0, -1), mutation];
  }
  return [...mutations, mutation];
}

function isCurrentUnreadMentionsRuntime(
  state: ActivityState,
  ownerKey: string,
  runtimeGeneration: number,
): boolean {
  return (
    state.unreadMentionsOwnerKey === ownerKey &&
    state.unreadMentionsRuntimeGeneration === runtimeGeneration
  );
}

function isCurrentLiveMentionMessagesRuntime(
  state: ActivityState,
  ownerKey: string,
  runtimeGeneration: number,
): boolean {
  return (
    state.liveMentionMessagesOwnerKey === ownerKey &&
    state.liveMentionMessagesRuntimeGeneration === runtimeGeneration
  );
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  staleVersion: 0,
  unreadMentionsOwnerKey: null,
  ...emptyUnreadMentionsIndex,
  ...emptyLiveMentionMessages,
  markStale: () => set((state) => ({ staleVersion: state.staleVersion + 1 })),
  setUnreadMentionsOwner: (ownerKey) =>
    set((state) =>
      state.unreadMentionsOwnerKey === ownerKey
        ? state
        : {
            ...emptyUnreadMentionsIndex,
            ...emptyLiveMentionMessages,
            unreadMentionsOwnerKey: ownerKey,
            liveMentionMessagesOwnerKey: ownerKey,
          },
    ),
  startUnreadMentionsBootstrap: (ownerKey, runtimeGeneration) => {
    const token = ++nextUnreadMentionsBootstrapToken;
    set((state) => {
      const preserveLiveMessages = isCurrentLiveMentionMessagesRuntime(
        state,
        ownerKey,
        runtimeGeneration,
      );
      return {
        unreadMentionsOwnerKey: ownerKey,
        unreadMentionsByUuid: {},
        unreadMentionsCount: null,
        unreadMentionsStatus: "loading",
        unreadMentionsRuntimeGeneration: runtimeGeneration,
        unreadMentionsBootstrapToken: token,
        unreadMentionsBufferedMutations: [],
        unreadMentionsLastEpochVersion: null,
        liveMentionMessagesByUuid: preserveLiveMessages ? state.liveMentionMessagesByUuid : {},
        liveMentionMessagesOwnerKey: ownerKey,
        liveMentionMessagesRuntimeGeneration: runtimeGeneration,
        liveMentionMessagesLastEpochVersion: preserveLiveMessages
          ? state.liveMentionMessagesLastEpochVersion
          : null,
      };
    });
    return token;
  },
  finishUnreadMentionsBootstrap: (ownerKey, runtimeGeneration, token, mentions) => {
    const state = get();
    if (
      !isCurrentUnreadMentionsRuntime(state, ownerKey, runtimeGeneration) ||
      state.unreadMentionsStatus !== "loading" ||
      state.unreadMentionsBootstrapToken !== token
    ) {
      return false;
    }

    let index = createUnreadMentionsIndex(mentions);
    const bufferedMutations = [...state.unreadMentionsBufferedMutations].sort(
      (left, right) => left.epochVersion - right.epochVersion,
    );
    for (const mutation of bufferedMutations) {
      index = applyUnreadMentionMutation(
        index.unreadMentionsByUuid,
        index.unreadMentionsCount,
        mutation,
      );
    }
    set(
      indexState(index, {
        unreadMentionsStatus: "ready",
        unreadMentionsRuntimeGeneration: runtimeGeneration,
        unreadMentionsBootstrapToken: null,
        unreadMentionsBufferedMutations: [],
        unreadMentionsLastEpochVersion: bufferedMutations.at(-1)?.epochVersion ?? null,
      }),
    );
    return true;
  },
  failUnreadMentionsBootstrap: (ownerKey, runtimeGeneration, token) =>
    set((state) =>
      isCurrentUnreadMentionsRuntime(state, ownerKey, runtimeGeneration) &&
      state.unreadMentionsBootstrapToken === token
        ? {
            unreadMentionsByUuid: {},
            unreadMentionsCount: null,
            unreadMentionsStatus: "error",
            unreadMentionsBootstrapToken: null,
            unreadMentionsBufferedMutations: [],
            unreadMentionsLastEpochVersion: null,
          }
        : state,
    ),
  invalidateUnreadMentions: (ownerKey) =>
    set((state) =>
      state.unreadMentionsOwnerKey === ownerKey
        ? {
            staleVersion: state.staleVersion + 1,
            unreadMentionsByUuid: {},
            unreadMentionsCount: null,
            unreadMentionsStatus: "idle",
            unreadMentionsBootstrapToken: null,
            unreadMentionsBufferedMutations: [],
            unreadMentionsLastEpochVersion: null,
          }
        : state,
    ),
  applyUnreadMentionMutation: (ownerKey, runtimeGeneration, mutation) =>
    set((state) => {
      if (!isCurrentUnreadMentionsRuntime(state, ownerKey, runtimeGeneration)) return state;
      if (state.unreadMentionsStatus === "loading") {
        return {
          unreadMentionsBufferedMutations: appendBufferedMutation(
            state.unreadMentionsBufferedMutations,
            mutation,
          ),
        };
      }
      if (state.unreadMentionsStatus !== "ready") return state;
      if (
        state.unreadMentionsLastEpochVersion != null &&
        mutation.epochVersion <= state.unreadMentionsLastEpochVersion
      ) {
        return state;
      }
      const index = applyUnreadMentionMutation(
        state.unreadMentionsByUuid,
        state.unreadMentionsCount ?? 0,
        mutation,
      );
      return {
        ...indexState(index, {
          unreadMentionsStatus: state.unreadMentionsStatus,
          unreadMentionsRuntimeGeneration: state.unreadMentionsRuntimeGeneration,
          unreadMentionsBootstrapToken: state.unreadMentionsBootstrapToken,
          unreadMentionsBufferedMutations: state.unreadMentionsBufferedMutations,
          unreadMentionsLastEpochVersion: mutation.epochVersion,
        }),
      };
    }),
  applyLiveMentionMessageMutation: (ownerKey, runtimeGeneration, mutation) =>
    set((state) => {
      if (!isCurrentLiveMentionMessagesRuntime(state, ownerKey, runtimeGeneration)) return state;
      if (
        state.liveMentionMessagesLastEpochVersion != null &&
        mutation.epochVersion <= state.liveMentionMessagesLastEpochVersion
      ) {
        return state;
      }

      if (mutation.kind === "upsert") {
        return {
          liveMentionMessagesByUuid: {
            ...state.liveMentionMessagesByUuid,
            [mutation.message.uuid]: mutation.message,
          },
          liveMentionMessagesLastEpochVersion: mutation.epochVersion,
        };
      }

      if (state.liveMentionMessagesByUuid[mutation.uuid] == null) {
        return { liveMentionMessagesLastEpochVersion: mutation.epochVersion };
      }
      const liveMentionMessagesByUuid = { ...state.liveMentionMessagesByUuid };
      delete liveMentionMessagesByUuid[mutation.uuid];
      return {
        liveMentionMessagesByUuid,
        liveMentionMessagesLastEpochVersion: mutation.epochVersion,
      };
    }),
  clear: () =>
    set({
      staleVersion: 0,
      unreadMentionsOwnerKey: null,
      ...emptyUnreadMentionsIndex,
      ...emptyLiveMentionMessages,
    }),
}));
