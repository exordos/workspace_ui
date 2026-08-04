import React from "react";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import IncomingCallVideoIcon from "~/shared/assets/icons/call_incoming_video_toggle.svg?react";
import { Icon } from "~/shared/ui/icon";

/**
 * Figma `button group` 6176:36282 — Material 40×40 icon frames.
 * Shared close/phone SVGs are viewBox-cropped, so glyph sizes (not outer
 * slot) must match the vectors inside those frames.
 */
export const INCOMING_CALL_ICON_SLOT_PX = 40;
/** Figma close vector ≈ 20.31 inside the 40 box. */
export const INCOMING_CALL_CLOSE_GLYPH_PX = 20;
/** Figma call vector ≈ 26.67 inside the 40 box. */
export const INCOMING_CALL_PHONE_GLYPH_PX = 27;

/** Fallback phone in the empty avatar. */
export const INCOMING_CALL_AVATAR_PHONE_SIZE = 48;

export interface IncomingCallLargeProps {
  inviteTitle: string;
  inviteAvatarUrn?: string;
  inviteAvatarLetter: string;
  videoEnabled: boolean;
  onToggleVideo: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallLarge: React.FC<IncomingCallLargeProps> = ({
  inviteTitle,
  inviteAvatarUrn,
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
          {inviteAvatarUrn != null ? (
            <WorkspaceAvatar
              size="lg"
              avatarUrn={inviteAvatarUrn}
              className="!h-[160px] !w-[160px] bg-neutral-500 text-white sm:!h-[200px] sm:!w-[200px]"
            >
              {inviteAvatarLetter}
            </WorkspaceAvatar>
          ) : (
            <span className="flex h-[160px] w-[160px] items-center justify-center rounded-full bg-neutral-500 text-white sm:h-[200px] sm:w-[200px]">
              {inviteAvatarLetter !== "?" ? (
                <span className="text-6xl font-semibold text-white sm:text-7xl">
                  {inviteAvatarLetter}
                </span>
              ) : (
                <Icon
                  name="phone"
                  size={INCOMING_CALL_AVATAR_PHONE_SIZE}
                  className="text-current"
                />
              )}
            </span>
          )}
          <div className="space-y-2 text-center">
            <p className="text-2xl font-semibold text-white">{inviteTitle}</p>
            <p className="text-lg text-white/60">{t("call.incomingChooseMethod")}</p>
          </div>
        </div>

        {/* Figma button group: 514×52, gap 8, buttons pad 6/16, icon slot 40, gap 6 */}
        <div className="w-full max-w-[514px]">
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={videoEnabled}
              onClick={onToggleVideo}
              data-testid="incoming-call-video-toggle"
              className={`flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg px-4 py-1.5 text-base font-normal transition-colors sm:w-[169px] sm:flex-none ${
                videoEnabled
                  ? "hover:bg-call-green/85 bg-call-green text-black"
                  : "hover:bg-bg-elevated/80 border border-border-subtle bg-bg text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <IncomingCallVideoIcon
                  className="h-10 w-10 shrink-0"
                  aria-hidden="true"
                  data-testid="incoming-call-video-icon"
                />
                <span className="truncate">{t("call.withVideo")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onDecline}
              data-testid="incoming-call-decline"
              className="hover:bg-call-red/85 flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg bg-call-red px-4 py-1.5 text-base font-normal text-white transition-colors sm:w-[160px] sm:flex-none"
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center"
                  data-testid="incoming-call-decline-icon-slot"
                >
                  <Icon name="close" size={INCOMING_CALL_CLOSE_GLYPH_PX} className="text-current" />
                </span>
                <span className="truncate">{t("call.cancel")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onAccept}
              data-testid="incoming-call-accept"
              className="hover:bg-call-green/85 flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-lg bg-call-green px-4 py-1.5 text-base font-normal text-black transition-colors sm:w-[169px] sm:flex-none"
            >
              <span className="inline-flex h-10 min-w-0 items-center gap-1.5">
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center"
                  data-testid="incoming-call-accept-icon-slot"
                >
                  <Icon name="phone" size={INCOMING_CALL_PHONE_GLYPH_PX} className="text-current" />
                </span>
                <span className="truncate">{t("call.accept")}</span>
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
