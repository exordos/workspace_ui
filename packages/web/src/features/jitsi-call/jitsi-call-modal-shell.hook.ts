import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { t } from "~/i18n/i18n";
import { JITSI_PARTICIPANTS_POLL_MS } from "~/shared/config/constants";
import { callState } from "~/shared/lib/call-state";
import { parseJitsiUrl } from "~/shared/lib/jitsi";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  resolveJitsiCallHeaderSubtitle,
  resolveJitsiCallHeaderTitle,
} from "./jitsi-call-header.lib";
import { configureJitsiIframe } from "./jitsi-call-permissions.lib";
import { getDefaultPipWindowBounds, type PipWindowBounds } from "./jitsi-call-pip.lib";
import { parseJitsiMeetingUrlLoose } from "./jitsi-call-url.lib";
import { useJitsiParticipantCount } from "./jitsi-participant-count.hook";
import type { JitsiCallModalProps, JitsiExternalApiWithParticipants } from "./jitsi-call.types";

const DESKTOP_INSET = 32;
const MOBILE_INSET = 16;
const DESKTOP_BREAKPOINT = 640;
const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 180;

interface ViewportSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getExpandedWindowBounds(viewportSize: ViewportSize): PipWindowBounds {
  const inset =
    viewportSize.width >= DESKTOP_BREAKPOINT && viewportSize.height >= DESKTOP_BREAKPOINT
      ? DESKTOP_INSET
      : MOBILE_INSET;
  return {
    x: inset,
    y: inset,
    width: Math.max(MIN_WINDOW_WIDTH, viewportSize.width - inset * 2),
    height: Math.max(MIN_WINDOW_HEIGHT, viewportSize.height - inset * 2),
  };
}

export function useJitsiCallModalShell({
  open,
  meetingUrl,
  locationName,
  displayName: displayNameFromCall,
  startWithVideoMuted = true,
  onClose,
}: JitsiCallModalProps) {
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const callLocationNameRef = useRef(locationName?.trim() ?? "");
  const participantPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [pipWindowBounds, setPipWindowBounds] =
    useState<PipWindowBounds>(getDefaultPipWindowBounds);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(getViewportSize);

  const parsedMeeting = useMemo(
    () =>
      meetingUrl ? (parseJitsiUrl(meetingUrl) ?? parseJitsiMeetingUrlLoose(meetingUrl)) : null,
    [meetingUrl],
  );
  const parsedDomain = parsedMeeting?.domain ?? null;
  const parsedRoomName = parsedMeeting?.roomName ?? null;
  const { participantCount, onApiReady: onParticipantCountApiReady } =
    useJitsiParticipantCount(open);
  const setParticipants = useCallParticipantsStore((s) => s.setParticipants);
  const clearParticipants = useCallParticipantsStore((s) => s.clearParticipants);
  const trimmedDisplayName = displayNameFromCall?.trim() ?? "";
  const displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : t("call.participant");
  const callLocationName = locationName?.trim() ?? "";
  const expandedWindowBounds = useMemo(() => getExpandedWindowBounds(viewportSize), [viewportSize]);
  const windowBounds = isMinimized ? pipWindowBounds : expandedWindowBounds;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    callLocationNameRef.current = callLocationName;
  }, [callLocationName]);

  const clearParticipantPolling = useCallback(() => {
    if (participantPollIntervalRef.current != null) {
      clearInterval(participantPollIntervalRef.current);
      participantPollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (open && parsedRoomName != null) {
      const activeDisplayName = callLocationNameRef.current;
      callState.start({
        roomName: parsedRoomName,
        participants: 1,
        displayName: activeDisplayName.length > 0 ? activeDisplayName : undefined,
      });
      return () => {
        callState.end();
        clearParticipantPolling();
        clearParticipants(meetingUrl);
      };
    }

    callState.end();
    clearParticipantPolling();
    if (meetingUrl.length > 0) {
      clearParticipants(meetingUrl);
    }
    void Promise.resolve().then(() => {
      setIsMinimized(false);
      setIsNativeFullscreen(false);
      setPipWindowBounds(getDefaultPipWindowBounds());
    });
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch((err) =>
          reportUnexpectedError("jitsi:fullscreenExit", err),
        );
      }
    }
    return undefined;
  }, [open, meetingUrl, parsedRoomName, clearParticipants, clearParticipantPolling]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === fullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !isMinimized) {
        setIsMinimized(true);
      }
    },
    [isMinimized],
  );

  const handleIframeReady = useCallback((ref: HTMLElement | null) => {
    configureJitsiIframe(ref);
  }, []);

  const handleReadyToClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const handleApiReady = useCallback(
    (api: JitsiExternalApiWithParticipants) => {
      clearParticipantPolling();
      onParticipantCountApiReady(api);

      const updateParticipants = () => {
        try {
          const list = api.getParticipantsInfo?.() ?? [];
          const participants = list.map(
            (participant: { displayName?: string; displayname?: string }) => ({
              displayName:
                participant.displayName ?? participant.displayname ?? t("call.participant"),
            }),
          );
          setParticipants(meetingUrl, participants);
        } catch {
          // ignore
        }
      };

      updateParticipants();
      participantPollIntervalRef.current = setInterval(
        updateParticipants,
        JITSI_PARTICIPANTS_POLL_MS,
      );

      const syncCallState = () => {
        const nextParticipantCount = api.getNumberOfParticipants?.();
        if (typeof nextParticipantCount === "number") {
          callState.updateParticipants(nextParticipantCount);
        }
      };

      syncCallState();
      api.on("participantJoined", syncCallState);
      api.on("participantLeft", syncCallState);
    },
    [clearParticipantPolling, meetingUrl, onParticipantCountApiReady, setParticipants],
  );

  const toggleNativeFullscreen = useCallback(async () => {
    if (fullscreenRef.current == null) return;
    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen?.();
      } else {
        await fullscreenRef.current.requestFullscreen?.();
      }
    } catch {
      // Fullscreen API not supported or denied.
    }
  }, []);

  const toggleMinimized = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      return;
    }
    setIsMinimized(true);
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch((err) =>
          reportUnexpectedError("jitsi:fullscreenExit", err),
        );
      }
    }
  }, [isMinimized]);

  const callName = callLocationName.length > 0 ? callLocationName : (parsedRoomName ?? "");
  const headerTitle = resolveJitsiCallHeaderTitle(callName, participantCount);
  const headerSubtitle = resolveJitsiCallHeaderSubtitle(participantCount);

  return {
    fullscreenRef,
    isMinimized,
    isNativeFullscreen,
    windowBounds,
    parsedDomain,
    parsedRoomName,
    displayName,
    startWithVideoMuted,
    headerTitle,
    headerSubtitle,
    handleOpenChange,
    handleIframeReady,
    handleReadyToClose,
    handleApiReady,
    toggleNativeFullscreen,
    toggleMinimized,
    setPipWindowBounds,
    onClose,
    open,
  };
}
