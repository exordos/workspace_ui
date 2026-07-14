import React, { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";

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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={handleBold} disabled={disabled}>
          B
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleItalic} disabled={disabled}>
          I
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleLink} disabled={disabled}>
          {t("mail.link")}
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={t("mail.body")}
        className="min-h-40 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onInput={handleInput}
        suppressContentEditableWarning
      />
    </div>
  );
};
