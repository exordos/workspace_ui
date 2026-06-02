// Этот файл описывает основную UI-оболочку Jitsi-звонка.
// Он отвечает за стабильный host для Jitsi, за переключение между expanded и PiP режимами
// и за то, чтобы shell-ререндеры не пересоздавали саму Jitsi-сессию.

import { JitsiMeeting } from "@jitsi/react-sdk";
import * as Dialog from "@radix-ui/react-dialog";
import React, { useMemo } from "react";
import { Rnd } from "react-rnd";
import { t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_OVERLAY_CLASS } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { useJitsiCallModalShell } from "./jitsi-call-modal-shell.hook";
import type { JitsiCallModalProps, JitsiExternalApiWithParticipants } from "./jitsi-call.types";

// Минимальная ширина floating PiP-окна, ниже которой звонком уже неудобно пользоваться.
const MIN_WINDOW_WIDTH = 280;
// Минимальная высота floating PiP-окна, чтобы embed не схлопывался в нечитаемый прямоугольник.
const MIN_WINDOW_HEIGHT = 180;
// Базовая конфигурация Jitsi, которая относится к самой сессии звонка.
// Она должна оставаться стабильной и не зависеть от minimize/expand состояния.
const JITSI_CONFIG_OVERWRITE_BASE = {
  startWithAudioMuted: true,
  prejoinConfig: { enabled: false },
} as const;
// Настройки интерфейса Jitsi, которые не должны меняться из-за оболочки модалки.
const JITSI_INTERFACE_CONFIG_OVERWRITE = {
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
} as const;
// Внешний контейнер Dialog.Content всегда занимает весь viewport,
// а само окно внутри него уже управляется через Rnd.
const OUTER_DIALOG_CLASS_NAME =
  "fixed inset-0 z-modal border-0 bg-transparent p-0 shadow-none outline-none pointer-events-none";
// Это общий visual shell окна звонка. Он один и тот же и для expanded, и для PiP режима.
const WINDOW_CLASS_NAME =
  "pointer-events-auto flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

// Эти props описывают только session-level данные, необходимые самому embed-компоненту.
// Shell-состояние вроде minimized, fullscreen или bounds сюда специально не попадает.
interface JitsiCallEmbedProps {
  displayName: string;
  domain: string | null;
  roomName: string | null;
  startWithVideoMuted: boolean;
  onApiReady: (api: JitsiExternalApiWithParticipants) => void;
  onIframeReady: (ref: HTMLElement | null) => void;
  onReadyToClose: () => void;
}

// Этот memoized-компонент изолирует сам Jitsi embed от ререндеров оболочки.
// Пока не меняются session-level props, minimize/expand и resize не должны создавать новый embed.
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

// Главный shell-компонент звонка.
// Он управляет только оболочкой окна и session lifecycle вокруг embed, но не должен заставлять
// Jitsi пересоздаваться при обычных UI-переключениях.
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

  // Dialog.Root держим в стабильном режиме, чтобы minimize/expand не менял внутренний lifecycle Radix
  // и не создавал косвенный remount Jitsi subtree.
  // Rnd тоже остаётся смонтированным всегда: окно меняет только bounds и интерактивность,
  // а не host-контейнер Jitsi.
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
            <JitsiCallEmbed
              displayName={displayName}
              domain={parsedDomain}
              roomName={parsedRoomName}
              startWithVideoMuted={startWithVideoMuted}
              onApiReady={handleApiReady}
              onIframeReady={handleIframeReady}
              onReadyToClose={handleReadyToClose}
            />
          </div>
        </div>
      </Rnd>
    </AppDialogShell>
  );
};
