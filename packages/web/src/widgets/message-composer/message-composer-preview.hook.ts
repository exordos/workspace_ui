import { useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { renderMessageContent } from "~/shared/api/zulip-messages";
import { messageBodyToUnsanitizedDisplayHtml } from "~/shared/lib/message-markdown-display.lib";

export function useMessageComposerPreview(options: {
  mode: "write" | "preview";
  outgoingBody: string;
  enabled?: boolean;
  unsupportedText?: string;
}): { html: string; loading: boolean; error: string | null } {
  const { mode, outgoingBody, enabled = true, unsupportedText } = options;
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "preview") return;
    // На Workspace route preview пока не рендерим через Zulip endpoint, а показываем понятную заглушку.
    if (!enabled) {
      setHtml("");
      setLoading(false);
      setError(unsupportedText ?? t("composer.actionUnsupported"));
      return;
    }
    if (outgoingBody.trim().length === 0) {
      setHtml("");
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void renderMessageContent(outgoingBody)
      .then((rendered) => {
        if (cancelled) return;
        setHtml(rendered);
      })
      .catch(() => {
        if (cancelled) return;
        try {
          setHtml(messageBodyToUnsanitizedDisplayHtml(outgoingBody, { treatAsMarkdown: true }));
          setError(null);
        } catch {
          setHtml("");
          setError(t("composer.previewError"));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, mode, outgoingBody, unsupportedText]);

  return { html, loading, error };
}
