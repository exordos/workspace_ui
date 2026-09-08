import { useCallback, useEffect, useRef, useState } from "react";
import { stickerRuntimeKey } from "~/entities/sticker/sticker-workspace.repository";
import { t } from "~/i18n/i18n";
import { MessengerApiError } from "~/shared/api/messenger-client";

export function useStickerAdminRequest() {
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const run = useCallback(
    async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const owner = stickerRuntimeKey();
      setBusy(true);
      setError(null);
      try {
        const result = await operation(controller.signal);
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) return result;
      } catch (cause) {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) {
          setError(
            cause instanceof MessengerApiError && cause.status === 403
              ? t("sticker.forbidden")
              : t("sticker.operationError"),
          );
        }
      } finally {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) setBusy(false);
      }
    },
    [],
  );
  return { run, busy, error };
}
