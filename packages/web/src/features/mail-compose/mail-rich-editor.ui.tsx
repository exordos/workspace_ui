import React, { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface MailRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

export const MailRichEditor: React.FC<MailRichEditorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    onChange(editor.innerHTML);
  }, [onChange]);

  const runCommand = useCallback(
    (command: string, value?: string) => {
      if (disabled) return;
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      handleInput();
    },
    [disabled, handleInput],
  );

  const handleBold = useCallback(() => {
    runCommand("bold");
  }, [runCommand]);

  const handleItalic = useCallback(() => {
    runCommand("italic");
  }, [runCommand]);

  const handleLink = useCallback(() => {
    const url = window.prompt(t("mail.linkPrompt"));
    if (url == null || url.trim().length === 0) return;
    runCommand("createLink", url.trim());
  }, [runCommand]);

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-bg focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
      <div className="flex min-h-10 flex-wrap items-center gap-1 border-b border-border-subtle bg-card-bg px-2 py-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleBold}
          disabled={disabled}
          className="h-8 w-8 px-0 text-sm font-bold"
        >
          B
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleItalic}
          disabled={disabled}
          className="h-8 w-8 px-0 text-sm italic"
        >
          I
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleLink}
          disabled={disabled}
          className="gap-1.5 px-2"
        >
          <Icon name="links" size={15} />
          {t("mail.link")}
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={t("mail.body")}
        className="min-h-52 w-full bg-bg px-4 py-3 text-sm leading-relaxed text-text-primary outline-none"
        onInput={handleInput}
        suppressContentEditableWarning
      />
    </div>
  );
};
