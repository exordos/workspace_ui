// Zustand-store remove-stream-members.
// Нужен для управления состоянием удаления участников в правой панели (pending/errors/submit).
import { create } from "zustand";
import { guard } from "~/shared/lib/guards";
import { logStoreAction } from "~/shared/lib/logger";
import { removeStreamMembers } from "./remove-stream-members.api";
import type {
  RemoveStreamMemberSubmitOptions,
  RemoveStreamMembersResult,
} from "./remove-stream-members.types";

// Пустой список pending-id для стабильных reset-ов состояния.
const EMPTY_PENDING_USER_IDS: number[] = [];
// Пустая карта ошибок по пользователям.
const EMPTY_ERRORS_BY_USER_ID: Record<number, string> = {};

interface RemoveStreamMembersState {
  pendingUserIds: number[];
  errorByUserId: Record<number, string>;
  lastError: string | null;
  submit: (options: RemoveStreamMemberSubmitOptions) => Promise<RemoveStreamMembersResult | null>;
  clear: () => void;
}

// Удаляет ошибку конкретного пользователя из карты ошибок.
function clearUserError(errors: Record<number, string>, userId: number): Record<number, string> {
  if (errors[userId] == null) {
    return errors;
  }
  const nextErrors = { ...errors };
  delete nextErrors[userId];
  return nextErrors;
}

export const useRemoveStreamMembersStore = create<RemoveStreamMembersState>((set, get) => ({
  pendingUserIds: EMPTY_PENDING_USER_IDS,
  errorByUserId: EMPTY_ERRORS_BY_USER_ID,
  lastError: null,

  // Выполняет удаление одного участника из текущего канала.
  // Поддерживает pending-state на user-id и синхронизирует last/errorByUserId.
  async submit(options) {
    const streamName = options.streamName.trim();
    if (streamName.length === 0) {
      set({ lastError: "app.error" });
      return null;
    }
    const streamId = guard.streamId(options.streamId, "removeStreamMembers.submit.streamId");
    const userId = guard.userId(options.userId, "removeStreamMembers.submit.userId");
    const state = get();
    if (state.pendingUserIds.includes(userId)) {
      return null;
    }

    logStoreAction("removeStreamMembers", "submit:start", { streamId });
    set({
      pendingUserIds: [...state.pendingUserIds, userId],
      errorByUserId: clearUserError(state.errorByUserId, userId),
      lastError: null,
    });

    const result = await removeStreamMembers({
      streamName,
      userIds: [userId],
    });
    const nextState = get();
    const nextPendingUserIds = nextState.pendingUserIds.filter((id) => id !== userId);

    if (!result.ok) {
      logStoreAction("removeStreamMembers", "submit:failure", {
        streamId,
        errorCode: result.errorCode,
      });
      set({
        pendingUserIds: nextPendingUserIds,
        errorByUserId: {
          ...nextState.errorByUserId,
          [userId]: "app.error",
        },
        lastError: "app.error",
      });
      return result;
    }

    logStoreAction("removeStreamMembers", "submit:success", {
      streamId,
      removedCount: result.removedUserIds.length,
      alreadyUnsubscribedCount: result.alreadyUnsubscribedUserIds.length,
    });
    set({
      pendingUserIds: nextPendingUserIds,
      errorByUserId: clearUserError(nextState.errorByUserId, userId),
      lastError: null,
    });
    options.onSuccess?.(streamId);
    return result;
  },

  // Сбрасывает state remove-flow (например, при переключении контекста).
  clear() {
    logStoreAction("removeStreamMembers", "clear", {});
    set({
      pendingUserIds: EMPTY_PENDING_USER_IDS,
      errorByUserId: EMPTY_ERRORS_BY_USER_ID,
      lastError: null,
    });
  },
}));
