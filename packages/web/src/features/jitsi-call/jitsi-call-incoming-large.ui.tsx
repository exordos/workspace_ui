import React from "react";
import { t } from "~/i18n/i18n";
import IncomingCallVideoIcon from "~/shared/assets/icons/call_incoming_video_toggle.svg?react";
import { Icon } from "~/shared/ui/icon";

export interface IncomingCallLargeProps {
  inviteTitle: string;
  inviteAvatarSrc: string | null;
  inviteAvatarLetter: string;
  videoEnabled: boolean;
  onToggleVideo: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallLarge: React.FC<IncomingCallLargeProps> = ({
  inviteTitle,
  inviteAvatarSrc,
  inviteAvatarLetter,
  videoEnabled,
  onToggleVideo,
  onAccept,
  onDecline,
}) => {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-modal flex items-center justify-center p-4"
      data-testid="incoming-call-large"
    >
      <div className="absolute inset-0 bg-black/55" />
      <section
        className="pointer-events-auto relative flex h-[574px] max-h-[calc(100vh-2rem)] w-[918px] max-w-[calc(100vw-2rem)] flex-col items-center justify-between overflow-hidden rounded-2xl px-6 py-8 sm:px-12 sm:py-10"
        style={{ backgroundColor: "#000000" }}
      >
        <div className="mt-3 flex flex-col items-center gap-5 sm:mt-6 sm:gap-7">
          {inviteAvatarSrc != null ? (
            <span className="h-[160px] w-[160px] overflow-hidden rounded-full bg-neutral-500 sm:h-[200px] sm:w-[200px]">
              <img src={inviteAvatarSrc} alt="" className="h-full w-full object-cover" />
            </span>
          ) : (
            <span className="flex h-[160px] w-[160px] items-center justify-center rounded-full bg-neutral-500 text-white sm:h-[200px] sm:w-[200px]">
              {inviteAvatarLetter !== "?" ? (
                <span className="text-6xl font-semibold text-white sm:text-7xl">
                  {inviteAvatarLetter}
                </span>
              ) : (
                <Icon name="phone" size={68} className="text-current" />
              )}
            </span>
          )}
          <div className="space-y-2 text-center">
            <p className="text-2xl font-semibold text-white">{inviteTitle}</p>
            <p className="text-lg text-white/60">{t("call.incomingChooseMethod")}</p>
          </div>
        </div>

        <div className="w-full max-w-[514px]">
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={videoEnabled}
              onClick={onToggleVideo}
              data-testid="incoming-call-video-toggle"
              className={`flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg px-4 text-base font-medium transition-colors sm:w-[169px] sm:flex-none ${
                videoEnabled
                  ? "hover:bg-call-green/85 bg-call-green text-black"
                  : "hover:bg-bg-elevated/80 border border-border-subtle bg-bg text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <IncomingCallVideoIcon className="h-10 w-10 shrink-0" aria-hidden="true" />
                <span className="truncate">{t("call.withVideo")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onDecline}
              data-testid="incoming-call-decline"
              className="hover:bg-call-red/85 flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg bg-call-red px-4 text-base font-medium text-white transition-colors sm:w-[160px] sm:flex-none"
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <Icon name="close" size={40} className="text-current" />
                <span className="truncate">{t("call.cancel")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onAccept}
              data-testid="incoming-call-accept"
              className="hover:bg-call-green/85 flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg bg-call-green px-4 text-base font-medium text-black transition-colors sm:w-[169px] sm:flex-none"
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <Icon name="phone" size={40} className="text-current" />
                <span className="truncate">{t("call.accept")}</span>
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
