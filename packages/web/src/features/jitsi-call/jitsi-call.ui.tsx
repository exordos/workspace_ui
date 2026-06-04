// Jitsi call UI shell: stable embed host, expanded/PiP modes — shell re-renders must not remount the session.

import { JitsiMeeting } from "@jitsi/react-sdk";
import * as Dialog from "@radix-ui/react-dialog";
import React, { useMemo } from "react";
import { Rnd } from "react-rnd";
import { t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_OVERLAY_CLASS } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { Spinner } from "~/shared/ui/spinner.ui";
import { useJitsiExternalApiLoader } from "./jitsi-call-api-loader.hook";
import { useJitsiCallModalShell } from "./jitsi-call-modal-shell.hook";
import type { JitsiCallModalProps, JitsiExternalApiWithParticipants } from "./jitsi-call.types";

const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 180;
// Session-level Jitsi config — stable across minimize/expand.
const JITSI_CONFIG_OVERWRITE_BASE = {
  startWithAudioMuted: true,
  prejoinConfig: { enabled: false },
} as const;
// Jitsi UI settings independent of modal shell state.
const JITSI_INTERFACE_CONFIG_OVERWRITE = {
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
} as const;
// Dialog.Content fills viewport; Rnd controls the inner window bounds.
const OUTER_DIALOG_CLASS_NAME =
  "fixed inset-0 z-modal border-0 bg-transparent p-0 shadow-none outline-none pointer-events-none";
// Shared visual shell for expanded and PiP modes.
const WINDOW_CLASS_NAME =
  "pointer-events-auto flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

// Session-level embed props only — shell state (minimized, bounds) stays outside.
interface JitsiCallEmbedProps {
  displayName: string;
  domain: string | null;
  roomName: string | null;
  startWithVideoMuted: boolean;
  onApiReady: (api: JitsiExternalApiWithParticipants) => void;
  onIframeReady: (ref: HTMLElement | null) => void;
  onReadyToClose: () => void;
}

// Isolates Jitsi embed from shell re-renders — minimize/expand/resize must not remount.
const JitsiCallEmbed: React.FC<JitsiCallEmbedProps> = React.memo(function JitsiCallEmbed({
  displayName,
  domain,
  roomName,
  startWithVideoMuted,
  onApiReady,
  onIframeReady,
  onReadyToClose,
}) {
  const configOverwrite = useMemo(
    () => ({
      ...JITSI_CONFIG_OVERWRITE_BASE,
      startWithVideoMuted,
    }),
    [startWithVideoMuted],
  );

  if (domain == null || roomName == null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
        {t("call.invalidLink")}
      </div>
    );
  }

  return (
    <JitsiMeeting
      domain={domain}
      roomName={roomName}
      onApiReady={onApiReady}
      getIFrameRef={onIframeReady}
      onReadyToClose={onReadyToClose}
      userInfo={{ displayName, email: "" }}
      configOverwrite={configOverwrite}
      interfaceConfigOverwrite={JITSI_INTERFACE_CONFIG_OVERWRITE}
    />
  );
});

// Call window shell — manages layout around embed without remounting Jitsi on UI toggles.
export const JitsiCallModal: React.FC<JitsiCallModalProps> = (props) => {
  const {
    open,
    handleOpenChange,
    isMinimized,
    windowBounds,
    setPipWindowBounds,
    fullscreenRef,
    isNativeFullscreen,
    headerTitle,
    headerSubtitle,
    toggleNativeFullscreen,
    toggleMinimized,
    onClose,
    parsedDomain,
    parsedRoomName,
    displayName,
    startWithVideoMuted,
    handleApiReady,
    handleIframeReady,
    handleReadyToClose,
  } = useJitsiCallModalShell(props);
  const { loadState: jitsiApiLoadState, retry: retryJitsiApiLoad } =
    useJitsiExternalApiLoader(open);

  // Keep Dialog.Root and Rnd mounted — minimize/expand only change bounds, not the Jitsi host.
  return (
    <AppDialogShell
      open={open}
      modal={false}
      onOpenChange={handleOpenChange}
      showOverlay={!isMinimized}
      overlayClassName={APP_DIALOG_OVERLAY_CLASS}
      forceMountContent
      contentClassName={`${OUTER_DIALOG_CLASS_NAME} data-[state=closed]:hidden`}
      onPointerDownOutside={(event) => {
        if (!isMinimized) {
          event.preventDefault();
        }
      }}
      onInteractOutside={(event) => {
        if (!isMinimized) {
          event.preventDefault();
        }
      }}
    >
      <Rnd
        position={{ x: windowBounds.x, y: windowBounds.y }}
        size={{ width: windowBounds.width, height: windowBounds.height }}
        minWidth={MIN_WINDOW_WIDTH}
        minHeight={MIN_WINDOW_HEIGHT}
        bounds={isMinimized ? "body" : "window"}
        disableDragging={!isMinimized}
        enableResizing={isMinimized}
        className={isMinimized ? "pointer-events-auto z-pip" : "pointer-events-auto"}
        onDragStop={(_event, data) => {
          if (!isMinimized) return;
          setPipWindowBounds((currentBounds) => ({
            ...currentBounds,
            x: data.x,
            y: data.y,
          }));
        }}
        onResizeStop={(_event, _direction, ref, _delta, position) => {
          if (!isMinimized) return;
          setPipWindowBounds({
            x: position.x,
            y: position.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          });
        }}
      >
        <div
          ref={fullscreenRef}
          className={WINDOW_CLASS_NAME}
          data-testid={isMinimized ? "jitsi-pip-content" : "jitsi-call-window"}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-2 py-1.5 sm:px-4 sm:py-2">
            <div className="min-w-0">
              <Dialog.Title asChild>
                <span className="block min-w-0 truncate text-xs font-semibold text-text-primary sm:text-sm">
                  {headerTitle}
                </span>
              </Dialog.Title>
              {headerSubtitle ? (
                <Dialog.Description asChild>
                  <span className="block min-w-0 truncate text-[11px] text-text-muted">
                    {headerSubtitle}
                  </span>
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{t("call.call")}</Dialog.Description>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {!isMinimized ? (
                <button
                  type="button"
                  onClick={toggleNativeFullscreen}
                  className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
                  aria-label={
                    isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")
                  }
                  title={isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")}
                >
                  <Icon
                    name={isNativeFullscreen ? "fullscreen_exit" : "fullscreen"}
                    size={18}
                    className="text-current"
                  />
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleMinimized}
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
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {jitsiApiLoadState === "loading" ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-text-muted"
                aria-busy="true"
              >
                <Spinner size="lg" />
                <span>{t("call.apiLoading")}</span>
              </div>
            ) : null}
            {jitsiApiLoadState === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <p className="text-sm text-notice-base">{t("call.apiLoadFailed")}</p>
                <button
                  type="button"
                  onClick={retryJitsiApiLoad}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
                >
                  {t("app.retry")}
                </button>
              </div>
            ) : null}
            {jitsiApiLoadState === "ready" ? (
              <JitsiCallEmbed
                displayName={displayName}
                domain={parsedDomain}
                roomName={parsedRoomName}
                startWithVideoMuted={startWithVideoMuted}
                onApiReady={handleApiReady}
                onIframeReady={handleIframeReady}
                onReadyToClose={handleReadyToClose}
              />
            ) : null}
          </div>
        </div>
      </Rnd>
    </AppDialogShell>
  );
};
