import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { mutateSelection, wrapSelection } from "./message-composer-selection.lib";
import { TOOLBAR_BTN, TOOLBAR_GLYPH } from "./message-composer-styles.lib";
import type { FormattingToolbarProps } from "./message-composer.types";

export const FormattingToolbar = React.memo<FormattingToolbarProps>(function FormattingToolbar({
  textareaRef,
  onValueChange,
  fileTrigger,
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
  const hasMediaActions = fileTrigger != null || callLinkTrigger != null;
  const hasAssistActions = scheduleTrigger != null || snippetsTrigger != null || aiTrigger != null;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0.5 py-1"
      role="toolbar"
      aria-label={t("a11y.messageComposer")}
    >
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("**")}
        title={t("composer.bold")}
        aria-label={t("composer.bold")}
      >
        <span className={`${TOOLBAR_GLYPH} font-semibold`}>B</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("*")}
        title={t("composer.italic")}
        aria-label={t("composer.italic")}
      >
        <span className={`${TOOLBAR_GLYPH} italic`}>I</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("~~")}
        title={t("composer.strikethrough")}
        aria-label={t("composer.strikethrough")}
      >
        <span className={`${TOOLBAR_GLYPH} line-through`}>S</span>
      </button>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={quote}
        title={t("composer.quote")}
        aria-label={t("composer.quote")}
      >
        <span className={`${TOOLBAR_GLYPH} font-semibold`}>&gt;</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={bulletedList}
        title={t("composer.bulletedList")}
        aria-label={t("composer.bulletedList")}
      >
        <Icon name="list_bulleted" size={14} className="text-current" />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={numberedList}
        title={t("composer.numberedList")}
        aria-label={t("composer.numberedList")}
      >
        <span className={TOOLBAR_GLYPH}>1.</span>
      </button>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("`")}
        title={t("composer.code")}
        aria-label={t("composer.code")}
      >
        <span className="font-mono text-[11px] leading-none text-current">&lt;/&gt;</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("||")}
        title={t("composer.spoiler")}
        aria-label={t("composer.spoiler")}
      >
        <span className="font-mono text-[11px] leading-none text-current">||</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={codeBlock}
        title={t("composer.codeBlock")}
        aria-label={t("composer.codeBlock")}
      >
        <span className="font-mono text-[11px] leading-none text-current">{"{ }"}</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={link}
        title={t("composer.link")}
        aria-label={t("composer.link")}
      >
        <Icon name="links" size={14} className="text-current" />
      </button>
      {(hasMediaActions || hasAssistActions) && (
        <>
          <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          {fileTrigger}
          {callLinkTrigger}
          {hasMediaActions && hasAssistActions && (
            <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          )}
          {scheduleTrigger}
          {snippetsTrigger}
          {aiTrigger}
        </>
      )}
    </div>
  );
});
