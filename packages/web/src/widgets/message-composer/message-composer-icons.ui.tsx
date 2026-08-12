import React from "react";
import ComposerAttachCompactSvg from "~/shared/assets/icons/composer-attach-compact.svg?react";
import ComposerAttachSvg from "~/shared/assets/icons/composer-attach.svg?react";
import BottomPanelCloseSvg from "~/shared/assets/icons/composer-bottom-panel-close.svg?react";
import BottomPanelOpenSvg from "~/shared/assets/icons/composer-bottom-panel-open.svg?react";
import ComposerEmojiSvg from "~/shared/assets/icons/composer-emoji.svg?react";
import ComposerSendSvg from "~/shared/assets/icons/composer-send.svg?react";

interface MessageComposerIconProps {
  className?: string;
}

interface MessageComposerAttachIconProps extends MessageComposerIconProps {
  compact?: boolean;
}

export const MessageComposerBottomPanelCloseIcon = React.memo(
  function MessageComposerBottomPanelCloseIcon({ className = "" }: MessageComposerIconProps) {
    return (
      <BottomPanelCloseSvg
        width={21.333}
        height={21.333}
        className={`shrink-0 ${className}`.trim()}
        data-composer-icon="bottom-panel-close"
        aria-hidden
      />
    );
  },
);

export const MessageComposerBottomPanelOpenIcon = React.memo(
  function MessageComposerBottomPanelOpenIcon({ className = "" }: MessageComposerIconProps) {
    return (
      <BottomPanelOpenSvg
        width={21.333}
        height={21.333}
        className={`shrink-0 ${className}`.trim()}
        data-composer-icon="bottom-panel-open"
        aria-hidden
      />
    );
  },
);

export const MessageComposerAttachIcon = React.memo(function MessageComposerAttachIcon({
  className = "",
  compact = false,
}: MessageComposerAttachIconProps) {
  const AttachSvg = compact ? ComposerAttachCompactSvg : ComposerAttachSvg;
  return (
    <AttachSvg
      width={compact ? 14 : 14.35}
      height={24}
      className={`shrink-0 ${className}`.trim()}
      data-composer-icon="attach"
      aria-hidden
    />
  );
});

export const MessageComposerEmojiIcon = React.memo(function MessageComposerEmojiIcon({
  className = "",
}: MessageComposerIconProps) {
  return (
    <ComposerEmojiSvg
      width={24}
      height={24}
      className={`shrink-0 ${className}`.trim()}
      data-composer-icon="emoji"
      aria-hidden
    />
  );
});

export const MessageComposerSendIcon = React.memo(function MessageComposerSendIcon({
  className = "",
}: MessageComposerIconProps) {
  return (
    <ComposerSendSvg
      width={24}
      height={20}
      className={`shrink-0 ${className}`.trim()}
      data-composer-icon="send"
      aria-hidden
    />
  );
});

export const MessageComposerFullHeightGlyph = React.memo(function MessageComposerFullHeightGlyph() {
  return (
    <span
      className="flex h-6 w-[22px] select-none items-center justify-center text-lg font-normal leading-6"
      style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif' }}
      data-composer-icon="full-height"
      aria-hidden
    >
      ⤢
    </span>
  );
});
