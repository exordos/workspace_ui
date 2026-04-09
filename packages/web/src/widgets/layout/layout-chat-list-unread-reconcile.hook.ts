// One-shot reconcile unread-состояния chat-list с сервером после bootstrap.
// Нужен, чтобы локальные unread badge не оставались устаревшими после старта приложения.
import { useEffect, useRef } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { fetchUnreadMessagesSnapshot } from "~/shared/api/zulip";

// Параметры запуска reconcile.
export function useLayoutChatListUnreadReconcile(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
  currentUserId: number | null;
  // Маркер того, что bootstrap chat-list уже применён.
  bootstrapAppliedInstanceId: string | null;
  // Счётчик bootstrap-применений (нужен для one-shot запуска на каждый bootstrap).
  bootstrapAppliedSeq: number;
}): void {
  const {
    currentInstanceId,
    currentUserStatus,
    currentUserId,
    bootstrapAppliedInstanceId,
    bootstrapAppliedSeq,
  } = options;

  // Защита от повторного запуска reconcile для одного и того же bootstrap.
  const appliedRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentInstanceId == null) return;
    if (currentUserStatus !== "ready") return;
    if (currentUserId == null) return;
    if (bootstrapAppliedInstanceId !== currentInstanceId) return;
    if (bootstrapAppliedSeq <= 0) return;

    // runKey уникален для конкретного bootstrap конкретного инстанса.
    const runKey = `${currentInstanceId}:${bootstrapAppliedSeq}`;
    if (appliedRunKeyRef.current === runKey) return;
    appliedRunKeyRef.current = runKey;

    let cancelled = false;

    void fetchUnreadMessagesSnapshot()
      .then((snapshot) => {
        if (cancelled || snapshot == null) return;
        // На момент ответа могли переключить инстанс — не применяем чужие данные.
        if (useInstancesStore.getState().currentInstanceId !== currentInstanceId) return;
        useChatListStore.getState().reconcileUnreadFromServer(snapshot);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    currentInstanceId,
    currentUserStatus,
    currentUserId,
    bootstrapAppliedInstanceId,
    bootstrapAppliedSeq,
  ]);
}
