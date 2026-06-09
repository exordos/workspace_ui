import { useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { renderMessageContent } from "~/shared/api/zulip-messages";
import { messageBodyToUnsanitizedDisplayHtml } from "~/shared/lib/message-markdown-display.lib";

export function useMessageComposerPreview(options: {
  mode: "write" | "preview";
  outgoingBody: string;
}): { html: string; loading: boolean; error: string | null } {
  const { mode, outgoingBody } = options;
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "preview") return;
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
  }, [mode, outgoingBody]);

  return { html, loading, error };
}
