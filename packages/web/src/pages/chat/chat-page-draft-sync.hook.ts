import { useEffect, type MutableRefObject } from "react";
import { useLocation } from "react-router-dom";
import { resolveHydratedDraftBootstrap } from "~/entities/draft/draft-chat-bootstrap.lib";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { DraftType } from "~/entities/draft/draft.types";
import { consumePendingForwardPrefill } from "./chat-forward.lib";

export interface UseChatPageDraftSyncParams {
  draftType: DraftType | null;
  draftTo: number[];
  draftTopic: string;
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"];
  composerValueRef: MutableRefObject<string>;
  activeDraftIdRef: MutableRefObject<number | null>;
  pendingForwardPrefillRef: MutableRefObject<string | null>;
  setDraftInitialValue: (value: string) => void;
}

/** Hydrates composer draft from store / forward prefill when route or drafts change. */
export function useChatPageDraftHydration({
  draftType,
  draftTo,
  draftTopic,
  drafts,
  composerValueRef,
  activeDraftIdRef,
  pendingForwardPrefillRef,
  setDraftInitialValue,
}: UseChatPageDraftSyncParams): void {
  const location = useLocation();

  useEffect(() => {
    if (!draftType || draftTo.length === 0) return;
    const pendingForwardPrefill = consumePendingForwardPrefill(location.pathname);
    if (pendingForwardPrefill != null) {
      pendingForwardPrefillRef.current = pendingForwardPrefill;
      setDraftInitialValue(pendingForwardPrefill);
      composerValueRef.current = pendingForwardPrefill;
      activeDraftIdRef.current = null;
      return;
    }

    const existing = useDraftStore.getState().getDraftForChat(draftType, draftTo, draftTopic);
    if (existing) {
      setDraftInitialValue(existing.content);
      composerValueRef.current = existing.content;
      activeDraftIdRef.current = existing.id;
    } else {
      setDraftInitialValue("");
      composerValueRef.current = "";
      activeDraftIdRef.current = null;
    }
  }, [
    draftType,
    draftTo,
    draftTopic,
    location.pathname,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  ]);

  useEffect(() => {
    if (!draftType || draftTo.length === 0) return;
    if (pendingForwardPrefillRef.current != null) {
      pendingForwardPrefillRef.current = null;
      return;
    }
    const existing = useDraftStore.getState().getDraftForChat(draftType, draftTo, draftTopic);
    const bootstrap = resolveHydratedDraftBootstrap(composerValueRef.current, existing);
    if (!bootstrap) return;
    setDraftInitialValue(bootstrap.initialValue);
    composerValueRef.current = bootstrap.initialValue;
    activeDraftIdRef.current = bootstrap.activeDraftId;
  }, [
    draftType,
    draftTo,
    draftTopic,
    drafts,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  ]);
}
