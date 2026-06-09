import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createOnDmMessagesAppliedHandler } from "~/entities/chat-list/chat-list-sync-dm-from-window.lib";
import { createOnStreamMessagesAppliedHandler } from "~/entities/chat-list/chat-list-sync-stream-from-window.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { isSameChatLocation } from "~/entities/message/message-chat-context.lib";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { t } from "~/i18n/i18n";
import { getCurrentInstance } from "~/shared/api/client";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { createLogger } from "~/shared/lib/logger";
import { logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import { parseDmSlugToUserIds } from "~/widgets/sidebar/sidebar.lib";
import { shouldSkipFocusedAnchorInitialLoad } from "./chat-anchor-load.lib";
import { isAbortLikeError } from "./chat-page-ai.lib";
import { resolveMessagesLoadErrorAfterInitialLoad } from "./chat-page-initial-load-outcome.lib";
import { shouldLoadBoundaryPage } from "./chat-pagination.lib";
import type { ChatMessagesLoadErrorKind } from "./chat-page-message-list-section.types";

const PAGE_SIZE = 50;
const log = createLogger("chat-page:initial-load");

export interface UseChatPageInitialLoadOptions {
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  activeStreamCanonicalName: string | null;
  resolvedStreamId: number | null;
  streamRouteTopic: string;
  focusedMessageId: number | null;
  currentUserId: number | null;
  isFocusedMessageLoadedInCurrentRoute: boolean;
  setActionError: (error: string | null) => void;
}

export interface UseChatPageInitialLoadResult {
  messagesLoading: boolean;
  hasInitialMessagesPayload: boolean;
  messagesLoadError: ChatMessagesLoadErrorKind | null;
  loadOlderMessages: () => void;
  loadNewerMessages: () => void;
  handleRetryMessagesLoad: () => void;
}

export function useChatPageInitialLoad(
  options: UseChatPageInitialLoadOptions,
): UseChatPageInitialLoadResult {
  const {
    streamSlug,
    topicName,
    dmIdParam,
    activeStreamCanonicalName,
    resolvedStreamId,
    streamRouteTopic,
    focusedMessageId,
    currentUserId,
    isFocusedMessageLoadedInCurrentRoute,
    setActionError,
  } = options;

  const setContext = useCurrentChatMessagesStore((s) => s.setContext);
  const loadInitialMessagesForContext = useCurrentChatMessagesStore(
    (s) => s.loadInitialMessagesForContext,
  );
  const loadOlderBoundaryPage = useCurrentChatMessagesStore((s) => s.loadOlderBoundaryPage);
  const loadNewerBoundaryPage = useCurrentChatMessagesStore((s) => s.loadNewerBoundaryPage);
  const clearInitialLoadError = useCurrentChatMessagesStore((s) => s.clearInitialLoadError);

  const onDmMessagesApplied = useMemo(
    () =>
      createOnDmMessagesAppliedHandler({
        getInstanceId: () => getCurrentInstance()?.id ?? null,
        getCurrentUserId: () => useChatListStore.getState().currentUserId,
      }),
    [],
  );
  const onStreamMessagesApplied = useMemo(() => createOnStreamMessagesAppliedHandler(), []);

  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasInitialMessagesPayload, setHasInitialMessagesPayload] = useState(false);
  const [messagesLoadError, setMessagesLoadError] = useState<ChatMessagesLoadErrorKind | null>(
    null,
  );
  const [messagesReloadNonce, setMessagesReloadNonce] = useState(0);
  const cacheHydratedBeforeApiRef = useRef(false);

  useEffect(() => {
    if (!streamSlug) {
      if (!dmIdParam || dmIdParam === "") {
        logMessageFlow("ui:stream route effect → setContext(null)", { reason: "no stream slug" });
        setContext(null);
      }
      return;
    }
    if (!activeStreamCanonicalName || resolvedStreamId == null) {
      logMessageFlow("ui:stream route effect → setContext(null)", {
        reason: "stream name/id not resolved",
      });
      setContext(null);
      return;
    }
    const streamWideView = topicName == null;
    const nextContext: CurrentChatContext = {
      type: "stream",
      streamId: resolvedStreamId,
      streamName: activeStreamCanonicalName,
      topic: streamRouteTopic,
      streamWideView,
    };
    if (isSameChatLocation(useCurrentChatMessagesStore.getState().context, nextContext)) {
      return;
    }
    logMessageFlow("ui:stream route effect → setContext(stream)", {
      streamId: resolvedStreamId,
      topic: streamRouteTopic,
      streamWideView,
    });
    setContext(nextContext);
  }, [
    dmIdParam,
    streamSlug,
    setContext,
    resolvedStreamId,
    activeStreamCanonicalName,
    streamRouteTopic,
    topicName,
  ]);

  useEffect(() => {
    if (!streamSlug) {
      setHasInitialMessagesPayload(false);
      setMessagesLoading(false);
      return;
    }
    if (!activeStreamCanonicalName || resolvedStreamId == null) {
      setHasInitialMessagesPayload(false);
      setMessagesLoading(false);
      return;
    }
    const { hasOlderMessages, hasNewerMessages } = useCurrentChatMessagesStore.getState();
    if (
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId,
        isFocusedMessageLoadedInCurrentRoute,
        hasOlderMessages,
        hasNewerMessages,
      })
    ) {
      setHasInitialMessagesPayload(true);
      setMessagesLoading(false);
      return;
    }

    cacheHydratedBeforeApiRef.current = false;
    setMessagesLoadError(null);
    setHasInitialMessagesPayload(false);
    if (focusedMessageId != null) {
      setActionError(null);
    }
    setMessagesLoading(true);
    const initialLoadController = new AbortController();
    loadInitialMessagesForContext({
      context: {
        type: "stream",
        streamId: resolvedStreamId,
        streamName: activeStreamCanonicalName,
        topic: streamRouteTopic,
        streamWideView: topicName == null,
      },
      focusedMessageId,
      currentUserId,
      signal: initialLoadController.signal,
      onStreamMessagesApplied,
      onCacheHydrated: () => {
        if (!initialLoadController.signal.aborted) {
          cacheHydratedBeforeApiRef.current = true;
          setHasInitialMessagesPayload(true);
        }
      },
    })
      .then(() => {
        if (!initialLoadController.signal.aborted) {
          const loadErrorKind = resolveMessagesLoadErrorAfterInitialLoad(
            cacheHydratedBeforeApiRef.current,
          );
          setMessagesLoadError(loadErrorKind);
          if (loadErrorKind == null) {
            setHasInitialMessagesPayload(true);
            if (
              focusedMessageId != null &&
              useCurrentChatMessagesStore.getState().messages.length === 0
            ) {
              setActionError(t("message.anchorAccessDenied"));
            }
          }
          setMessagesLoading(false);
        }
      })
      .catch((e) => {
        if (!isAbortLikeError(e) && !initialLoadController.signal.aborted) {
          log.error("Initial stream load failed unexpectedly", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      initialLoadController.abort();
    };
  }, [
    streamSlug,
    activeStreamCanonicalName,
    resolvedStreamId,
    streamRouteTopic,
    topicName,
    focusedMessageId,
    currentUserId,
    loadInitialMessagesForContext,
    onStreamMessagesApplied,
    isFocusedMessageLoadedInCurrentRoute,
    messagesReloadNonce,
    setActionError,
  ]);

  useEffect(() => {
    if (!dmIdParam || dmIdParam === "") {
      if (!streamSlug) {
        logMessageFlow("ui:dm route effect → setContext(null)", { reason: "empty dm param" });
        setContext(null);
      }
      return;
    }
    if (currentUserId == null) return;

    const routeUserIds = parseDmSlugToUserIds(dmIdParam);
    const userIds = normalizeDmRouteUserIds(routeUserIds, currentUserId);
    if (userIds.length === 0) return;

    const dmKey = dmRouteKey(userIds, currentUserId);
    logMessageFlow("ui:dm route effect → setContext(dm)", { dmKey });
    setContext({ type: "dm", dmKey });
  }, [dmIdParam, streamSlug, currentUserId, setContext]);

  useEffect(() => {
    if (!dmIdParam || dmIdParam === "") return;

    const routeUserIds = parseDmSlugToUserIds(dmIdParam);
    const userIds = Array.from(new Set(routeUserIds)).filter(
      (userId) => Number.isSafeInteger(userId) && userId > 0,
    );
    if (userIds.length === 0) return;
    const { hasOlderMessages, hasNewerMessages } = useCurrentChatMessagesStore.getState();
    if (
      shouldSkipFocusedAnchorInitialLoad({
        focusedMessageId,
        isFocusedMessageLoadedInCurrentRoute,
        hasOlderMessages,
        hasNewerMessages,
      })
    ) {
      setHasInitialMessagesPayload(true);
      setMessagesLoading(false);
      return;
    }

    cacheHydratedBeforeApiRef.current = false;
    setMessagesLoadError(null);
    setHasInitialMessagesPayload(false);
    if (focusedMessageId != null) {
      setActionError(null);
    }
    setMessagesLoading(true);
    const initialLoadController = new AbortController();
    const dmKey = dmRouteKey(userIds, currentUserId);
    loadInitialMessagesForContext({
      context: { type: "dm", dmKey },
      focusedMessageId,
      currentUserId,
      signal: initialLoadController.signal,
      onDmMessagesApplied,
      onCacheHydrated: () => {
        if (!initialLoadController.signal.aborted) {
          cacheHydratedBeforeApiRef.current = true;
          setHasInitialMessagesPayload(true);
        }
      },
    })
      .then(() => {
        if (!initialLoadController.signal.aborted) {
          const loadErrorKind = resolveMessagesLoadErrorAfterInitialLoad(
            cacheHydratedBeforeApiRef.current,
          );
          setMessagesLoadError(loadErrorKind);
          if (loadErrorKind == null) {
            setHasInitialMessagesPayload(true);
            if (
              focusedMessageId != null &&
              useCurrentChatMessagesStore.getState().messages.length === 0
            ) {
              setActionError(t("message.anchorAccessDenied"));
            }
          }
          setMessagesLoading(false);
        }
      })
      .catch((e) => {
        if (!isAbortLikeError(e) && !initialLoadController.signal.aborted) {
          log.error("Initial DM load failed unexpectedly", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      initialLoadController.abort();
    };
  }, [
    dmIdParam,
    focusedMessageId,
    currentUserId,
    loadInitialMessagesForContext,
    onDmMessagesApplied,
    isFocusedMessageLoadedInCurrentRoute,
    messagesReloadNonce,
    setActionError,
  ]);

  const loadOlderMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    if (
      !shouldLoadBoundaryPage({
        isLoadingMore: store.isLoadingMore,
        hasBoundaryMessages: store.hasOlderMessages,
        messagesLength: store.messages.length,
      })
    ) {
      return;
    }
    void loadOlderBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [currentUserId, loadOlderBoundaryPage]);

  const loadNewerMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    if (
      !shouldLoadBoundaryPage({
        isLoadingMore: store.isLoadingMore,
        hasBoundaryMessages: store.hasNewerMessages,
        messagesLength: store.messages.length,
      })
    ) {
      return;
    }
    void loadNewerBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [currentUserId, loadNewerBoundaryPage]);

  const handleRetryMessagesLoad = useCallback(() => {
    clearInitialLoadError();
    setMessagesReloadNonce((n) => n + 1);
  }, [clearInitialLoadError]);

  return {
    messagesLoading,
    hasInitialMessagesPayload,
    messagesLoadError,
    loadOlderMessages,
    loadNewerMessages,
    handleRetryMessagesLoad,
  };
}
