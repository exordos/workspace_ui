import { useCallback, useEffect, useRef, useState } from "react";
import { getMessengerPollVoters } from "~/entities/messenger/messenger-poll-actions.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { PollVoterTarget, WorkspacePollQuestion } from "./workspace-message-poll.types";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
const emptyVoterUuids: readonly string[] = [];

interface VoterPage {
  key: string;
  items: readonly string[];
  marker?: string;
  loading?: boolean;
  failed?: boolean;
}

export function usePollVoterList(
  messageUuid: string,
  revision: number | undefined,
  questions: readonly WorkspacePollQuestion[],
) {
  const generation = useWorkspaceAuthStore((state) => state.runtimeGeneration);
  const messageKey = `${messageUuid}:${generation}`;
  const [selection, setSelection] = useState<{ messageKey: string; target: PollVoterTarget }>();
  const [page, setPage] = useState<VoterPage>();
  const request = useRef<AbortController | undefined>(undefined);
  const target = selection?.messageKey === messageKey ? selection.target : null;
  const option = questions
    .find((question) => question.id === target?.questionId)
    ?.options.find((item) => item.id === target?.optionId);
  if (selection != null && option == null) {
    setSelection(undefined);
    setPage(undefined);
  }
  const questionUuid = target?.questionId;
  const optionUuid = target?.optionId;
  const preview = option?.votes ? (option.previewVoterUuids ?? emptyVoterUuids) : emptyVoterUuids;
  // A cached or legacy snapshot can acquire previews at the same revision.
  const key =
    option &&
    `${messageKey}:${revision}:${questionUuid}:${optionUuid}:${option.votes}:${preview.join(",")}`;
  const current = page?.key === key ? page : undefined;
  const firstPageNeeded = option != null && option.votes > 0 && preview.length === 0;
  let marker = current?.marker;
  if (current == null && option && preview.length < option.votes) marker = preview.at(-1);
  const items = current?.items ?? preview;

  const fetchPage = useCallback(
    async (
      key: string,
      questionUuid: string,
      optionUuid: string,
      items: readonly string[],
      marker?: string,
    ) => {
      const context = getRuntimeContext();
      if (!context) return;
      const guard = captureWorkspaceRuntimeRequestContext(getRuntimeContext);
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const stale = () =>
        request.current !== controller ||
        isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext, controller.signal);
      try {
        const result = await getMessengerPollVoters({
          runtimeContext: context,
          getRuntimeContext,
          messageUuid,
          questionUuid,
          optionUuid,
          pageMarker: marker,
          signal: controller.signal,
        });
        if (stale()) return;
        setPage({
          key,
          items: [...new Set([...items, ...result.items.map(({ uuid }) => uuid)])],
          marker: result.nextPageMarker ?? undefined,
        });
      } catch {
        if (!stale()) setPage({ key, items, marker, failed: true });
      }
    },
    [messageUuid],
  );

  useEffect(() => {
    if (firstPageNeeded && key != null && questionUuid != null && optionUuid != null) {
      void fetchPage(key, questionUuid, optionUuid, emptyVoterUuids);
    }
    return () => request.current?.abort();
  }, [firstPageNeeded, key, questionUuid, optionUuid, fetchPage]);

  const select = (next: PollVoterTarget | null) => {
    if (next?.questionId !== questionUuid || next?.optionId !== optionUuid) {
      request.current?.abort();
      setPage(undefined);
    }
    setSelection(next == null ? undefined : { messageKey, target: next });
  };

  const loadPage = () => {
    if (key == null || questionUuid == null || optionUuid == null) return;
    if (current?.loading || (marker == null && !current?.failed)) return;
    setPage({ key, items, marker, loading: true });
    void fetchPage(key, questionUuid, optionUuid, items, marker);
  };

  const visiblePage = option && {
    items,
    loading: current?.loading ?? (current == null && firstPageNeeded),
    failed: current?.failed,
    hasMore: marker != null,
  };
  return { target: option ? target : null, page: visiblePage, select, loadPage };
}
