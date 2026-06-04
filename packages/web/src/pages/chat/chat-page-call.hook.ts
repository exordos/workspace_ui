import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext } from "~/entities/message/message-chat-context.lib";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { t } from "~/i18n/i18n";
import { sendMessage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { buildJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { startCallFromHeader } from "./chat-call-start.lib";
import {
  buildCallRoomName,
  canStartCallFromHeader,
  resolveCallMessageTargetParams,
} from "./chat-call.lib";

export interface UseChatPageCallOptions {
  isDmView: boolean;
  isGroupDmView: boolean;
  isOneToOneDm: boolean;
  partnerDeactivated: boolean;
  partnerUserId: number | null;
  partnerUserFullName: string | undefined;
  activeDmUserIds: number[] | null;
  activeStream: string | null;
  activeStreamId: number | null;
  activeTopic: string | null;
  dmChatName: string | undefined;
  currentUserId: number | null;
  setSendError: (error: string | null) => void;
  navigateToDm: (targetUserId: number) => void;
}

export interface UseChatPageCallResult {
  canStartCall: boolean;
  buildCurrentCallLink: () => string | null;
  handleCallClick: () => void;
}

export function useChatPageCall(options: UseChatPageCallOptions): UseChatPageCallResult {
  const {
    isDmView,
    isGroupDmView,
    isOneToOneDm,
    partnerDeactivated,
    partnerUserId,
    partnerUserFullName,
    activeDmUserIds,
    activeStream,
    activeStreamId,
    activeTopic,
    dmChatName,
    currentUserId,
    setSendError,
    navigateToDm,
  } = options;

  const openJitsiCall = useJitsiCallStore((s) => s.openCall);
  const jitsiHeaderCallInFlightRef = useRef<symbol | null>(null);

  const callTarget = useMemo(
    () =>
      resolveCallMessageTargetParams({
        isDmView,
        activeDmUserIds,
        activeStream,
        activeStreamId,
        activeTopic,
      }),
    [isDmView, activeDmUserIds, activeStream, activeStreamId, activeTopic],
  );

  const canStartCall = useMemo(
    () =>
      canStartCallFromHeader({
        target: callTarget,
        currentUserId,
      }) && !(isOneToOneDm && partnerDeactivated),
    [callTarget, currentUserId, isOneToOneDm, partnerDeactivated],
  );

  const callRoomChatLabel = useMemo(() => {
    if (callTarget?.mode !== "dm") {
      return null;
    }

    if (isGroupDmView) {
      const trimmedGroupName = dmChatName?.trim();
      return trimmedGroupName != null && trimmedGroupName.length > 0
        ? trimmedGroupName
        : t("dm.groupChat");
    }

    const trimmedPartnerName = partnerUserFullName?.trim();
    return trimmedPartnerName != null && trimmedPartnerName.length > 0
      ? trimmedPartnerName
      : t("dm.partner");
  }, [callTarget, isGroupDmView, dmChatName, partnerUserFullName]);

  const jitsiMeetBaseUrl = useInstancesStore((s) => s.jitsiMeetBaseUrl);
  const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
    () => ({ serverBaseUrl: jitsiMeetBaseUrl }),
    [jitsiMeetBaseUrl],
  );

  const buildCurrentCallLink = useCallback(() => {
    if (isOneToOneDm && partnerDeactivated) return null;
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null) {
      return null;
    }
    const roomName = buildCallRoomName({
      target: callTarget,
      currentUserId,
      chatLabel: callRoomChatLabel,
    });
    return buildJitsiMeetingUrl(roomName, jitsiLinkOptions);
  }, [
    callTarget,
    currentUserId,
    callRoomChatLabel,
    jitsiLinkOptions,
    isOneToOneDm,
    partnerDeactivated,
  ]);

  const appendMessageIfContextMatches = useCallback(
    (msg: MockMessage) => {
      const state = useCurrentChatMessagesStore.getState();
      if (isMessageForContext(msg, state.context, currentUserId)) {
        state.appendMessage(msg);
      }
    },
    [currentUserId],
  );

  const performStartCallFromHeader = useCallback(async () => {
    if (isOneToOneDm && partnerDeactivated) return;
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null) {
      return;
    }
    if (jitsiHeaderCallInFlightRef.current != null) {
      return;
    }
    const callToken = Symbol("jitsi-header-call");
    jitsiHeaderCallInFlightRef.current = callToken;
    setSendError(null);
    try {
      const result = await startCallFromHeader({
        target: callTarget,
        currentUserId,
        buildCurrentCallLink,
        isOneToOneDm,
        callRoomChatLabel,
        fallbackDmPartnerLabel: t("dm.partner"),
        currentUserLabel: t("common.you"),
        sendMessage,
        appendMessageToStore: appendMessageIfContextMatches,
        openModal: (url, locationName) => {
          openJitsiCall({ meetingUrl: url, locationName });
        },
        resolveErrorMessage: (error) =>
          error instanceof Error ? error.message : t("call.createFailed"),
      });
      if (!result.ok && result.error != null) {
        setSendError(result.error);
      }
    } finally {
      if (jitsiHeaderCallInFlightRef.current === callToken) {
        jitsiHeaderCallInFlightRef.current = null;
      }
    }
  }, [
    callTarget,
    currentUserId,
    buildCurrentCallLink,
    isOneToOneDm,
    callRoomChatLabel,
    appendMessageIfContextMatches,
    openJitsiCall,
    partnerDeactivated,
    setSendError,
  ]);

  const invokeDmCallFromProfileHandler = useCallback(
    (targetUserId: number) => {
      if (currentUserId == null || targetUserId === currentUserId) return;
      const inOneToOneWithPartner =
        isDmView && !isGroupDmView && partnerUserId != null && partnerUserId === targetUserId;
      if (inOneToOneWithPartner) {
        void performStartCallFromHeader();
        return;
      }
      useChatDmCallBridgeStore.getState().setPendingDmCallPartnerUserId(targetUserId);
      navigateToDm(targetUserId);
    },
    [
      currentUserId,
      isDmView,
      isGroupDmView,
      partnerUserId,
      performStartCallFromHeader,
      navigateToDm,
    ],
  );

  useEffect(() => {
    useChatDmCallBridgeStore
      .getState()
      .setInvokeDmCallFromProfileHandler(invokeDmCallFromProfileHandler);
    return () => {
      useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    };
  }, [invokeDmCallFromProfileHandler]);

  useEffect(() => {
    return () => {
      useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    };
  }, []);

  const pendingDmCallPartnerUserId = useChatDmCallBridgeStore((s) => s.pendingDmCallPartnerUserId);

  useEffect(() => {
    if (pendingDmCallPartnerUserId == null) return;
    if (!isDmView || isGroupDmView) return;
    if (partnerUserId !== pendingDmCallPartnerUserId) return;
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    void performStartCallFromHeader();
  }, [
    pendingDmCallPartnerUserId,
    isDmView,
    isGroupDmView,
    partnerUserId,
    performStartCallFromHeader,
  ]);

  return {
    canStartCall,
    buildCurrentCallLink,
    handleCallClick: performStartCallFromHeader,
  };
}
