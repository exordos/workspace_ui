/**
 * Chat info store — unified DM/channel info panel state.
 *
 * Holds the currently displayed chat info data (member list, counts,
 * description, mute status). The `type` field on ChatInfoData
 * distinguishes between DM and stream info.
 */

import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { logStoreAction } from "~/shared/lib/logger";
import {
  invalidateInstance,
  invalidateStream as invalidateStreamCache,
  loadStreamMembers,
  loadStreamMetadata,
} from "./chat-info.api";
import {
  buildDmChatInfoData,
  buildStreamChatInfoData,
  getChatInfoNetworkKey,
  isSameChatInfoData,
} from "./chat-info.lib";
import type { ChatInfoContext, ChatInfoData } from "./chat-info.types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ChatInfoState {
  data: ChatInfoData | null;
  loading: boolean;
  error: string | null;
  // Последний активный контекст chat-info (none/dm/stream).
  context: ChatInfoContext;
  // Последний загруженный server-список участников stream-контекста.
  streamMemberIds: number[];
  // Версия запроса для защиты от гонок (stale response).
  requestVersion: number;

  setData: (data: ChatInfoData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setContext: (context: ChatInfoContext) => void;
  hydrate: (context: ChatInfoContext) => Promise<void>;
  syncDerived: (context: ChatInfoContext) => void;
  invalidateStream: (instanceId: string, streamId: number) => void;
  clear: () => void;
}

const NONE_CONTEXT: ChatInfoContext = {
  kind: "none",
  instanceId: null,
};

// Преобразуем массив userId в загруженные user-records из users store.
function resolveUsersById(userIds: number[]) {
  const usersState = useUsersStore.getState();
  return userIds
    .map((id) => usersState.getUser(id))
    .filter((user): user is NonNullable<typeof user> => user != null);
}

// Проверяем, что ответ относится к актуальной версии запроса и тому же контексту.
function isCurrentHydration(
  state: ChatInfoState,
  version: number,
  context: ChatInfoContext,
): boolean {
  return (
    state.requestVersion === version &&
    getChatInfoNetworkKey(state.context) === getChatInfoNetworkKey(context)
  );
}

export const useChatInfoStore = create<ChatInfoState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  context: NONE_CONTEXT,
  streamMemberIds: [],
  requestVersion: 0,

  setData(data) {
    logStoreAction("chatInfo", "setData", { type: data.type, name: data.name });
    set({ data, loading: false, error: null });
  },

  setLoading(loading) {
    set({ loading });
  },

  setError(error) {
    logStoreAction("chatInfo", "setError", { error });
    set({ error, loading: false });
  },

  setContext(context) {
    const previous = get().context;
    // При смене инстанса сбрасываем API-кэши прошлого инстанса.
    if (
      previous.instanceId != null &&
      context.instanceId != null &&
      previous.instanceId !== context.instanceId
    ) {
      invalidateInstance(previous.instanceId);
    }
    set({ context });
  },

  async hydrate(context) {
    get().setContext(context);
    const nextVersion = get().requestVersion + 1;
    logStoreAction("chatInfo", "hydrate:start", {
      context: context.kind,
      instanceId: context.instanceId ?? undefined,
      streamId: context.kind === "stream" ? context.streamId : undefined,
    });
    set({
      requestVersion: nextVersion,
      loading: context.kind === "stream",
      error: null,
    });

    // Ветка без активного чата.
    if (context.kind === "none") {
      set({
        data: null,
        loading: false,
        error: null,
        streamMemberIds: [],
      });
      return;
    }

    // DM-контекст: сеть не нужна, собираем данные из users store.
    if (context.kind === "dm") {
      const members = resolveUsersById(context.participantIds);
      const nextData = buildDmChatInfoData(context.dmName, members, context.participantIds.length);
      const state = get();
      // Если контекст уже сменился, прекращаем обновление.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      if (isSameChatInfoData(state.data, nextData)) {
        set({ loading: false, error: null, streamMemberIds: [] });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: [],
      });
      return;
    }

    try {
      // Stream-контекст: eager-загрузка участников и метадаты параллельно.
      const [memberIds, metadata] = await Promise.all([
        loadStreamMembers(context.instanceId, context.streamId),
        loadStreamMetadata(context.instanceId, context.streamId),
      ]);
      const state = get();
      // Anti-race guard: устаревший ответ не должен переписать актуальный контекст.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      const members = resolveUsersById(memberIds);
      const nextData = buildStreamChatInfoData(
        context.streamName,
        memberIds,
        members,
        context.isMuted,
        {
          description: metadata.description,
          topics: context.topics,
        },
      );
      if (isSameChatInfoData(state.data, nextData)) {
        set({ loading: false, error: null, streamMemberIds: memberIds });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: memberIds,
      });
    } catch {
      const state = get();
      // Ошибку показываем только если это все еще актуальный запрос.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      set({
        error: "chat-info:hydrate_failed",
        loading: false,
      });
    }
  },

  syncDerived(context) {
    const state = get();
    // Derived-обновления применяем только к текущему активному контексту.
    if (getChatInfoNetworkKey(state.context) !== getChatInfoNetworkKey(context)) {
      return;
    }

    // Синхронный сброс для empty-контекста без сетевых вызовов.
    if (context.kind === "none") {
      if (state.data == null) return;
      set({ data: null, loading: false, error: null, streamMemberIds: [] });
      return;
    }

    // DM derived-пересчет делаем локально по users store.
    if (context.kind === "dm") {
      const members = resolveUsersById(context.participantIds);
      const nextData = buildDmChatInfoData(context.dmName, members, context.participantIds.length);
      if (isSameChatInfoData(state.data, nextData)) {
        return;
      }
      set({ data: nextData, loading: false, error: null, streamMemberIds: [] });
      return;
    }

    // Пока stream еще не догрузил участников, derived-пересчет пропускаем.
    if (state.loading && state.streamMemberIds.length === 0) {
      return;
    }

    // Stream derived-пересчет: topics/mute/presence без повторного HTTP.
    const members = resolveUsersById(state.streamMemberIds);
    const description = state.data?.type === "stream" ? state.data.description : null;
    const nextData = buildStreamChatInfoData(
      context.streamName,
      state.streamMemberIds,
      members,
      context.isMuted,
      {
        description,
        topics: context.topics,
      },
    );
    if (isSameChatInfoData(state.data, nextData)) {
      return;
    }
    set({ data: nextData, loading: false, error: null });
  },

  invalidateStream(instanceId, streamId) {
    logStoreAction("chatInfo", "invalidateStream", { instanceId, streamId });
    // Чистим API-кэш целевого stream и snapshot инстанса.
    invalidateStreamCache(instanceId, streamId);
    const context = get().context;
    // Если это текущий активный stream, сразу перезагружаем данные.
    if (
      context.kind === "stream" &&
      context.instanceId === instanceId &&
      context.streamId === streamId
    ) {
      void get().hydrate(context);
    }
  },

  clear() {
    logStoreAction("chatInfo", "clear");
    set((state) => ({
      data: null,
      loading: false,
      error: null,
      context: NONE_CONTEXT,
      streamMemberIds: [],
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
