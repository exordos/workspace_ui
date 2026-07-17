import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { resolveHydratedDraftBootstrap } from "~/entities/draft/draft-chat-bootstrap.lib";
import { useDraftStore } from "~/entities/draft/draft.model";
import { consumePendingForwardPrefill } from "./chat-forward.lib";

export interface UseChatPageDraftSyncParams {
  streamUuid: string | null;
  topicUuid: string | null;
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"];
  composerValueRef: RefObject<string>;
  activeDraftIdRef: RefObject<string | null>;
  pendingForwardPrefillRef: RefObject<string | null>;
  setDraftInitialValue: (value: string) => void;
}

function selectedDraftUuid(search: string): string | null {
  const value = new URLSearchParams(search).get("draft")?.trim();
  return value != null && value.length > 0 ? value : null;
}

/** Hydrates the exact selected draft UUID, or the newest draft for the current chat. */
export function useChatPageDraftHydration({
  streamUuid,
  topicUuid,
  drafts,
  composerValueRef,
  activeDraftIdRef,
  pendingForwardPrefillRef,
  setDraftInitialValue,
}: UseChatPageDraftSyncParams): void {
  const location = useLocation();

  useEffect(() => {
    if (streamUuid == null || topicUuid == null) return;
    const pendingForwardPrefill = consumePendingForwardPrefill(location.pathname);
    if (pendingForwardPrefill != null) {
      pendingForwardPrefillRef.current = pendingForwardPrefill;
      setDraftInitialValue(pendingForwardPrefill);
      composerValueRef.current = pendingForwardPrefill;
      activeDraftIdRef.current = null;
      return;
    }

    const store = useDraftStore.getState();
    const selectedUuid = selectedDraftUuid(location.search);
    const selected = selectedUuid == null ? undefined : store.getDraft(selectedUuid);
    const existing =
      selected?.stream_uuid === streamUuid && selected.topic_uuid === topicUuid
        ? selected
        : store.getLatestDraftForChat(streamUuid, topicUuid);
    if (existing != null) {
      setDraftInitialValue(existing.payload.content);
      composerValueRef.current = existing.payload.content;
      activeDraftIdRef.current = existing.uuid;
    } else {
      setDraftInitialValue("");
      composerValueRef.current = "";
      activeDraftIdRef.current = null;
    }
  }, [
    streamUuid,
    topicUuid,
    location.pathname,
    location.search,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  ]);

  useEffect(() => {
    if (streamUuid == null || topicUuid == null) return;
    if (pendingForwardPrefillRef.current != null) {
      pendingForwardPrefillRef.current = null;
      return;
    }
    const selectedUuid = selectedDraftUuid(location.search);
    const store = useDraftStore.getState();
    const selected = selectedUuid == null ? undefined : store.getDraft(selectedUuid);
    const existing =
      selected?.stream_uuid === streamUuid && selected.topic_uuid === topicUuid
        ? selected
        : store.getLatestDraftForChat(streamUuid, topicUuid);
    const bootstrap = resolveHydratedDraftBootstrap(composerValueRef.current, existing);
    if (!bootstrap) return;
    setDraftInitialValue(bootstrap.initialValue);
    composerValueRef.current = bootstrap.initialValue;
    activeDraftIdRef.current = bootstrap.activeDraftId;
  }, [
    streamUuid,
    topicUuid,
    drafts,
    location.search,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  ]);
}
