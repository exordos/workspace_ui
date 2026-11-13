// Jitsi call UI shell: stable embed host, expanded/PiP modes — shell re-renders must not remount the session.

import * as Dialog from "@radix-ui/react-dialog";
import { Rnd } from "react-rnd";
import { t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_OVERLAY_CLASS } from "~/shared/ui/app-dialog";
import { Icon } from "~/shared/ui/icon";
import { JitsiCallContent } from "./jitsi-call-content.ui";
import { useJitsiCallModalShell } from "./jitsi-call-modal-shell.hook";
import type { JitsiCallProps } from "./jitsi-call.types";

const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 180;
// Dialog.Content fills viewport; Rnd controls the inner window bounds.
const OUTER_DIALOG_CLASS_NAME =
  "fixed inset-0 z-modal border-0 bg-transparent p-0 shadow-none outline-none pointer-events-none";
// Shared visual shell for expanded and PiP modes.
const WINDOW_CLASS_NAME =
  "pointer-events-auto flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

// Call window shell — manages layout around embed without remounting Jitsi on UI toggles.
export function JitsiCallModal(props: Readonly<JitsiCallProps>) {
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
    embedProps,
  } = useJitsiCallModalShell(props);

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
                    size={28}
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
          <JitsiCallContent open={open} {...embedProps} />
        </div>
      </Rnd>
    </AppDialogShell>
  );
}
