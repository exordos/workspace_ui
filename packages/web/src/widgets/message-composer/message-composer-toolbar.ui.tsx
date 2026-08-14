import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import AddLinkSvg from "~/shared/assets/icons/composer-add-link.svg?react";
import ChatDashedSvg from "~/shared/assets/icons/composer-chat-dashed.svg?react";
import BoldSvg from "~/shared/assets/icons/composer-format-bold.svg?react";
import ItalicSvg from "~/shared/assets/icons/composer-format-italic.svg?react";
import FrameSourceSvg from "~/shared/assets/icons/composer-frame-source.svg?react";
import InlineCodeSvg from "~/shared/assets/icons/composer-inline-code.svg?react";
import BulletedListSvg from "~/shared/assets/icons/composer-list-bulleted.svg?react";
import NumberedListSvg from "~/shared/assets/icons/composer-list-numbered.svg?react";
import StrikethroughSvg from "~/shared/assets/icons/composer-strikethrough.svg?react";
import VisibilitySvg from "~/shared/assets/icons/composer-visibility.svg?react";
import { mutateSelection, wrapSelection } from "./message-composer-selection.lib";
import { TOOLBAR_BTN, TOOLBAR_TEXT_STYLE_GROUP } from "./message-composer-styles.lib";
import type { FormattingToolbarProps } from "./message-composer.types";

export const FormattingToolbar = React.memo<FormattingToolbarProps>(function FormattingToolbar({
  textareaRef,
  onValueChange,
  fileTrigger,
  emojiTrigger,
  callLinkTrigger,
  scheduleTrigger,
  snippetsTrigger,
  aiTrigger,
}) {
  const wrap = useCallback(
    (marker: string) => wrapSelection(textareaRef, marker, onValueChange),
    [textareaRef, onValueChange],
  );
  const quote = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const quoted = selected
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return {
          text: quoted,
          selectionStartOffset: quoted.length,
          selectionEndOffset: quoted.length,
        };
      }
      return {
        text: "> ",
        selectionStartOffset: 2,
        selectionEndOffset: 2,
      };
    });
  }, [onValueChange, textareaRef]);
  const codeBlock = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const block = `\`\`\`\n${selected}\n\`\`\``;
        return {
          text: block,
          selectionStartOffset: block.length,
          selectionEndOffset: block.length,
        };
      }
      return {
        text: "```\n\n```",
        selectionStartOffset: 4,
        selectionEndOffset: 4,
      };
    });
  }, [onValueChange, textareaRef]);
  const bulletedList = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const list = selected
          .split("\n")
          .map((line) => `- ${line}`)
          .join("\n");
        return {
          text: list,
          selectionStartOffset: list.length,
          selectionEndOffset: list.length,
        };
      }
      return {
        text: "- ",
        selectionStartOffset: 2,
        selectionEndOffset: 2,
      };
    });
  }, [onValueChange, textareaRef]);
  const numberedList = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const list = selected
          .split("\n")
          .map((line, index) => `${index + 1}. ${line}`)
          .join("\n");
        return {
          text: list,
          selectionStartOffset: list.length,
          selectionEndOffset: list.length,
        };
      }
      return {
        text: "1. ",
        selectionStartOffset: 3,
        selectionEndOffset: 3,
      };
    });
  }, [onValueChange, textareaRef]);
  const link = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const linkText = `[${selected}](https://)`;
        const urlStart = linkText.indexOf("https://");
        return {
          text: linkText,
          selectionStartOffset: urlStart,
          selectionEndOffset: linkText.length - 1,
        };
      }
      const fallback = `[${t("composer.linkText")}](https://)`;
      const urlStart = fallback.indexOf("https://");
      return {
        text: fallback,
        selectionStartOffset: urlStart,
        selectionEndOffset: fallback.length - 1,
      };
    });
  }, [onValueChange, textareaRef]);
  const hasMediaActions = fileTrigger != null || callLinkTrigger != null || emojiTrigger != null;
  const hasAssistActions = scheduleTrigger != null || snippetsTrigger != null || aiTrigger != null;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2"
      role="toolbar"
      aria-label={t("a11y.messageComposer")}
    >
      {fileTrigger}
      {callLinkTrigger}
      {(fileTrigger != null || callLinkTrigger != null) &&
        (emojiTrigger != null || hasAssistActions) && (
          <span className="h-7 w-px flex-shrink-0 bg-border-subtle" aria-hidden />
        )}
      {emojiTrigger}
      {scheduleTrigger}
      {snippetsTrigger}
      {aiTrigger}
      {(hasMediaActions || hasAssistActions) && (
        <span className="h-7 w-px flex-shrink-0 bg-border-subtle" aria-hidden />
      )}
      <div className={TOOLBAR_TEXT_STYLE_GROUP} data-testid="composer-text-style-group">
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={link}
          title={t("composer.link")}
          aria-label={t("composer.link")}
        >
          <AddLinkSvg
            width={24}
            height={14.769}
            className="text-current"
            data-composer-icon="add-link"
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={() => wrap("**")}
          title={t("composer.bold")}
          aria-label={t("composer.bold")}
        >
          <BoldSvg width={10.93} height={16.667} data-composer-icon="bold" aria-hidden />
        </button>
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={() => wrap("*")}
          title={t("composer.italic")}
          aria-label={t("composer.italic")}
        >
          <ItalicSvg width={15.448} height={16.747} data-composer-icon="italic" aria-hidden />
        </button>
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={() => wrap("~~")}
          title={t("composer.strikethrough")}
          aria-label={t("composer.strikethrough")}
        >
          <StrikethroughSvg
            width={25.333}
            height={19.79}
            data-composer-icon="strikethrough"
            aria-hidden
          />
        </button>
      </div>
      <span className="h-7 w-px flex-shrink-0 bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={numberedList}
        title={t("composer.numberedList")}
        aria-label={t("composer.numberedList")}
      >
        <NumberedListSvg
          width={21.333}
          height={24}
          data-composer-icon="numbered-list"
          aria-hidden
        />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={bulletedList}
        title={t("composer.bulletedList")}
        aria-label={t("composer.bulletedList")}
      >
        <BulletedListSvg
          width={21.328}
          height={19.533}
          className="text-current"
          data-composer-icon="bulleted-list"
          aria-hidden
        />
      </button>
      <span className="h-7 w-px flex-shrink-0 bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={quote}
        title={t("composer.quote")}
        aria-label={t("composer.quote")}
      >
        <ChatDashedSvg width={24} height={21.38} data-composer-icon="quote" aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={codeBlock}
        title={t("composer.codeBlock")}
        aria-label={t("composer.codeBlock")}
      >
        <FrameSourceSvg
          width={21.333}
          height={21.333}
          data-composer-icon="code-block"
          aria-hidden
        />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("`")}
        title={t("composer.code")}
        aria-label={t("composer.code")}
      >
        <InlineCodeSvg width={22} height={18} data-composer-icon="inline-code" aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("||")}
        title={t("composer.spoiler")}
        aria-label={t("composer.spoiler")}
      >
        <span className="relative flex h-6 w-[25.834px] items-center justify-center" aria-hidden>
          <VisibilitySvg width={25.834} height={17.333} data-composer-icon="spoiler-eye-off" />
          <span className="absolute h-px w-7 rotate-[-35deg] bg-current" />
        </span>
      </button>
    </div>
  );
});
