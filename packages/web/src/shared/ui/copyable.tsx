import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "~/i18n/i18n";
import { writeText } from "~/shared/lib/clipboard";
import { Icon } from "./icon";
import type { CopyableProps } from "./copyable.types";

const RESET_STATE_TIMEOUT_MS = 2000;

const joinClasses = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(" ");

export const Copyable: React.FC<CopyableProps> = React.memo(function Copyable({
  value,
  children,
  showOnHover = true,
  copyAriaLabel,
  className,
  contentClassName,
  buttonClassName,
}) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const keepVisibleDuringSuccess = showOnHover && copyState === "success";

  const actionLabel = useMemo(() => {
    if (copyState === "success") return t("message.copied");
    if (copyState === "error") return t("message.copyFailed");
    return copyAriaLabel ?? t("message.copy");
  }, [copyAriaLabel, copyState]);

  const handleCopy = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      void writeText(value).then((ok) => {
        setCopyState(ok ? "success" : "error");
      });
    },
    [value],
  );

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyState("idle");
    }, RESET_STATE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copyState]);

  return (
    <span className={joinClasses("group flex min-w-0 items-center gap-1.5", className)}>
      <span className={joinClasses("min-w-0 max-w-full", contentClassName)}>{children}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={actionLabel}
        title={actionLabel}
        data-copy-state={copyState}
        className={joinClasses(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-opacity hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
          showOnHover
            ? keepVisibleDuringSuccess
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            : "opacity-100",
          buttonClassName,
        )}
      >
        <Icon
          name={copyState === "success" ? "check" : "copy"}
          size={14}
          className="text-current"
        />
      </button>
    </span>
  );
});
