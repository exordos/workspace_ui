import { JitsiMeeting } from "@jitsi/react-sdk";
import * as Dialog from "@radix-ui/react-dialog";
import React, { useRef, useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import { useCallParticipantsStore } from "~/entities/call";
import { useChatListStore } from "~/entities/chat-list";
import { useUsersStore } from "~/entities/user";
import { t } from "~/i18n";
import { callState } from "~/shared/lib/call-state";
import { parseJitsiUrl } from "~/shared/lib/jitsi";
import { Icon } from "~/shared/ui";

/** Minimal type for Jitsi External API. */
interface JitsiExternalApi {
  getNumberOfParticipants: () => number;
  getParticipantsInfo: () => object[];
  on: (event: string, callback: () => void) => void;
}

export interface JitsiCallModalProps {
  open: boolean;
  meetingUrl: string;
  locationName?: string;
  onClose: () => void;
}

interface PipWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_PIP_WIDTH = 320;
const DEFAULT_PIP_HEIGHT = 220;
const PIP_WINDOW_MARGIN = 20;
const JITSI_IFRAME_ALLOW_POLICY = "camera; microphone; fullscreen; display-capture";

function configureJitsiIframe(iframeElement: HTMLElement | null, minimized: boolean): void {
  if (!iframeElement || !("style" in iframeElement)) return;
  iframeElement.style.width = "100%";
  iframeElement.style.height = "100%";
  iframeElement.style.minHeight = minimized ? "0" : "400px";
  iframeElement.setAttribute("allow", JITSI_IFRAME_ALLOW_POLICY);
}

function getDefaultPipWindowBounds(): PipWindowBounds {
  if (typeof window === "undefined") {
    return {
      x: 0,
      y: 0,
      width: DEFAULT_PIP_WIDTH,
      height: DEFAULT_PIP_HEIGHT,
    };
  }
  return {
    x: Math.max(PIP_WINDOW_MARGIN, window.innerWidth - DEFAULT_PIP_WIDTH - PIP_WINDOW_MARGIN),
    y: Math.max(PIP_WINDOW_MARGIN, window.innerHeight - DEFAULT_PIP_HEIGHT - PIP_WINDOW_MARGIN),
    width: DEFAULT_PIP_WIDTH,
    height: DEFAULT_PIP_HEIGHT,
  };
}

function useParticipantCount(open: boolean, _parsed: { domain: string; roomName: string } | null) {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);

  const updateCount = () => {
    const n = apiRef.current?.getNumberOfParticipants?.();
    if (typeof n === "number") setParticipantCount(n);
  };

  const onApiReady = (api: JitsiExternalApi) => {
    apiRef.current = api;
    setParticipantCount(api.getNumberOfParticipants());
    api.on("participantJoined", updateCount);
    api.on("participantLeft", updateCount);
  };

  useEffect(() => {
    if (open) return;
    apiRef.current = null;
    void Promise.resolve().then(() => {
      setParticipantCount(null);
    });
  }, [open]);

  return { participantCount, onApiReady };
}

export const JitsiCallModal: React.FC<JitsiCallModalProps> = ({
  open,
  meetingUrl,
  locationName,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLElement | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [pipWindowBounds, setPipWindowBounds] =
    useState<PipWindowBounds>(getDefaultPipWindowBounds);
  const parsed = meetingUrl ? parseJitsiUrl(meetingUrl) : null;
  const { participantCount, onApiReady } = useParticipantCount(open, parsed);
  const setParticipants = useCallParticipantsStore((s) => s.setParticipants);
  const clearParticipants = useCallParticipantsStore((s) => s.clearParticipants);
  const participantPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const getUser = useUsersStore((s) => s.getUser);
  const currentUser = currentUserId != null ? getUser(currentUserId) : undefined;
  const trimmedDisplayName = currentUser?.full_name?.trim();
  const displayName =
    trimmedDisplayName != null && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : t("call.participant");
  const callLocationName = locationName?.trim() ?? "";

  useEffect(() => {
    if (open && parsed) {
      callState.start({
        roomName: parsed.roomName,
        participants: 1,
        displayName: callLocationName.length > 0 ? callLocationName : undefined,
      });
    }
    if (!open) {
      callState.end();
      void Promise.resolve().then(() => {
        setIsMinimized(false);
        setIsNativeFullscreen(false);
        setPipWindowBounds(getDefaultPipWindowBounds());
      });
      if (document.fullscreenElement === fullscreenRef.current) {
        const fullscreenExitPromise = document.exitFullscreen?.();
        if (fullscreenExitPromise != null) {
          void fullscreenExitPromise.catch(() => {});
        }
      }
      if (participantPollIntervalRef.current) {
        clearInterval(participantPollIntervalRef.current);
        participantPollIntervalRef.current = null;
      }
      if (meetingUrl) clearParticipants(meetingUrl);
    }

    return () => {
      callState.end();
      if (participantPollIntervalRef.current) {
        clearInterval(participantPollIntervalRef.current);
        participantPollIntervalRef.current = null;
      }
    };
  }, [open, meetingUrl, parsed, clearParticipants, callLocationName]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === fullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    configureJitsiIframe(iframeRef.current, isMinimized);
  }, [isMinimized]);

  const callName = callLocationName.length > 0 ? callLocationName : (parsed?.roomName ?? "");
  const headerTitle =
    callName.length > 0
      ? `${t("call.call")} - ${callName}`
      : participantCount !== null
        ? t("call.callWithParticipants", { count: participantCount })
        : t("call.call");
  const headerSubtitle =
    participantCount !== null ? t("call.participants", { count: participantCount }) : undefined;

  const handleOpenChange = (o: boolean) => {
    if (!o && !isMinimized) setIsMinimized(true);
  };

  const handleApiReady = (api: JitsiExternalApi) => {
    onApiReady(api);
    const updateParticipants = () => {
      try {
        const list = api.getParticipantsInfo?.() ?? [];
        const participants = list.map(
          (p: { displayName?: string; displayname?: string; id?: string }) => ({
            displayName:
              (p as { displayName?: string }).displayName ??
              (p as { displayname?: string }).displayname ??
              t("call.participant"),
          }),
        );
        setParticipants(meetingUrl, participants);
      } catch {
        // ignore
      }
    };
    updateParticipants();
    participantPollIntervalRef.current = setInterval(updateParticipants, 5000);

    const syncCallState = () => {
      const n = api.getNumberOfParticipants?.();
      if (typeof n === "number") callState.updateParticipants(n);
    };
    syncCallState();
    api.on("participantJoined", syncCallState);
    api.on("participantLeft", syncCallState);
  };

  const toggleNativeFullscreen = async () => {
    if (!fullscreenRef.current) return;
    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen?.();
      } else {
        await fullscreenRef.current.requestFullscreen?.();
      }
    } catch {
      // Fullscreen API not supported or denied (e.g. not from user gesture in some browsers)
    }
  };

  const dialogContentBaseClass =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 flex flex-col border border-border-subtle bg-bg-elevated shadow-xl";
  const showPip = isMinimized && open;

  const dialogInner = (
    <div
      ref={fullscreenRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-bg-elevated"
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-2 py-1.5 sm:px-4 sm:py-2">
        <div className="min-w-0">
          <span className="block min-w-0 truncate text-xs font-semibold text-text-primary sm:text-sm">
            {headerTitle}
          </span>
          {headerSubtitle && (
            <span className="block min-w-0 truncate text-[11px] text-text-muted">
              {headerSubtitle}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isMinimized && (
            <button
              type="button"
              onClick={toggleNativeFullscreen}
              className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
              aria-label={isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")}
              title={isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")}
            >
              <Icon
                name={isNativeFullscreen ? "fullscreen_exit" : "fullscreen"}
                size={18}
                className="text-current"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isMinimized) {
                setIsMinimized(false);
              } else {
                setIsMinimized(true);
                if (document.fullscreenElement === fullscreenRef.current) {
                  const fullscreenExitPromise = document.exitFullscreen?.();
                  if (fullscreenExitPromise != null) {
                    void fullscreenExitPromise.catch(() => {});
                  }
                }
              }
            }}
            className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
            aria-label={isMinimized ? t("call.expand") : t("call.minimize")}
            title={isMinimized ? t("call.expand") : t("call.minimizeToWindow")}
          >
            <Icon
              name={isMinimized ? "chevron-up" : "chevron-down"}
              size={18}
              className="text-current"
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
            aria-label={t("call.closeCall")}
          >
            <Icon name="close" size={18} className="text-current" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {open && parsed && (
          <JitsiMeeting
            domain={parsed.domain}
            roomName={parsed.roomName}
            onApiReady={handleApiReady}
            getIFrameRef={(ref) => {
              iframeRef.current = ref;
              if (ref && containerRef.current) {
                configureJitsiIframe(ref, isMinimized);
              }
            }}
            onReadyToClose={onClose}
            userInfo={{ displayName, email: "" }}
            configOverwrite={{
              startWithAudioMuted: true,
              startWithVideoMuted: true,
              prejoinConfig: { enabled: false },
            }}
            interfaceConfigOverwrite={{
              DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            }}
          />
        )}
        {open && !parsed && meetingUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
            {t("call.invalidLink")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {showPip ? (
        <Rnd
          position={{ x: pipWindowBounds.x, y: pipWindowBounds.y }}
          size={{ width: pipWindowBounds.width, height: pipWindowBounds.height }}
          minWidth={280}
          minHeight={180}
          bounds="body"
          className="z-pip"
          enableResizing={true}
          onDragStop={(_event, data) => {
            setPipWindowBounds((currentBounds) => ({
              ...currentBounds,
              x: data.x,
              y: data.y,
            }));
          }}
          onResizeStop={(_event, _direction, ref, _delta, position) => {
            setPipWindowBounds({
              x: position.x,
              y: position.y,
              width: ref.offsetWidth,
              height: ref.offsetHeight,
            });
          }}
        >
          {/* Keep PiP outside Radix Portal/Presence so ref callbacks receive only DOM Elements. */}
          <div
            data-testid="jitsi-pip-content"
            className={`${dialogContentBaseClass} h-full w-full rounded-xl`}
            role="dialog"
            aria-label={t("call.call")}
          >
            {dialogInner}
          </div>
        </Rnd>
      ) : (
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className={`${dialogContentBaseClass} fixed inset-4 z-modal rounded-xl sm:inset-8`}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            {dialogInner}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
};
