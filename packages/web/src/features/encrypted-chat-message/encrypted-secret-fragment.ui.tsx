import { useEffect, useId, useMemo, useRef, useState } from "react";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import type { WorkspaceSecretUrnReference } from "~/shared/lib/workspace-reference-urn.lib";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { useRealSecretPresentation } from "./real-message-presentation.hook";

export interface EncryptedSecretFragmentProps {
  readonly message: MessengerMessage | null;
  readonly reference: WorkspaceSecretUrnReference;
  readonly onRequestKey?: (allowUsableKey: boolean) => void | Promise<void>;
  readonly requestPending?: boolean;
}

/** The existing session owns keys; only this mounted presentation owns decrypted text. */
export function EncryptedSecretFragment({
  message,
  reference,
  onRequestKey,
  requestPending,
}: EncryptedSecretFragmentProps) {
  const presentation = useRealSecretPresentation(message, reference);
  const [requestingScope, setRequestingScope] = useState<{
    reference: WorkspaceSecretUrnReference;
    message: MessengerMessage | null;
  } | null>(null);
  const requesting =
    requestingScope?.reference === reference && requestingScope.message === message;
  const requestGeneration = useRef(0);
  useEffect(() => {
    const generation = requestGeneration.current;
    return () => {
      requestGeneration.current = generation + 1;
    };
  }, [message, reference]);
  const requestKey = async () => {
    const generation = requestGeneration.current;
    setRequestingScope({ reference, message });
    try {
      await onRequestKey?.(presentation.status === "error");
    } finally {
      if (generation === requestGeneration.current) setRequestingScope(null);
    }
  };
  const rendered = useMemo(
    () =>
      presentation.status === "ready"
        ? renderWorkspaceMessageBody(parseWorkspaceMessageBody(presentation.plaintext))
        : null,
    [presentation],
  );
  return (
    <EncryptedSecretFragmentPresentation
      rendered={rendered}
      status={presentation.status}
      requestPending={requestPending ? true : requesting}
      onRetry={presentation.retry}
      onRequestKey={presentation.canRequestKey && onRequestKey != null ? requestKey : undefined}
    />
  );
}

export interface EncryptedSecretFragmentPresentationProps {
  readonly rendered: ReturnType<typeof renderWorkspaceMessageBody> | null;
  readonly status: "ready" | "loading" | "missing-key" | "error";
  readonly onRetry?: () => void;
  readonly onRequestKey?: () => void | Promise<void>;
  readonly requestPending?: boolean;
}

export function EncryptedSecretFragmentPresentation({
  rendered,
  status,
  onRetry,
  onRequestKey,
  requestPending,
}: EncryptedSecretFragmentPresentationProps) {
  if (status === "ready" && rendered != null) {
    return <ReadableSecretFragment key={rendered.html} rendered={rendered} />;
  }
  if (status === "missing-key" && onRequestKey != null) {
    return (
      <span
        className="inline-flex max-w-full align-middle"
        data-encrypted-secret-state={status}
        role="status"
        aria-busy={requestPending}
      >
        <Button
          type="button"
          size="sm"
          appearance="ghost"
          variant="neutral"
          className="!bg-bg/40 hover:!bg-bg-elevated/60 !h-7 whitespace-nowrap !px-2 !text-text-primary"
          leadingIcon={<Icon name="chatLock" size={14} />}
          disabled={requestPending}
          onClick={() => {
            void onRequestKey();
          }}
        >
          {t("e2ee.requestSecretKey")}
        </Button>
      </span>
    );
  }
  return (
    <span
      className="bg-bg/40 inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-border-subtle px-1 align-middle text-text-muted"
      data-encrypted-secret-state={status}
      role={status === "error" ? "alert" : "status"}
      aria-busy={status === "loading" || requestPending}
    >
      <Icon name="chatLock" size={14} />
      <span>
        {t(
          status === "loading"
            ? "e2ee.messageDecrypting"
            : status === "error"
              ? "e2ee.messageDecryptError"
              : "e2ee.secretFragment",
        )}
      </span>
      {onRequestKey != null && (
        <Button
          type="button"
          size="sm"
          appearance="ghost"
          variant="neutral"
          className="!h-auto !p-0 underline"
          disabled={requestPending}
          onClick={() => {
            void onRequestKey();
          }}
        >
          {t("e2ee.requestSecretKey")}
        </Button>
      )}
      {status === "error" && onRetry != null && (
        <Button
          type="button"
          size="sm"
          appearance="ghost"
          variant="neutral"
          className="!h-auto !p-0 underline"
          onClick={onRetry}
        >
          {t("e2ee.messageDecryptRetry")}
        </Button>
      )}
    </span>
  );
}

function ReadableSecretFragment({
  rendered,
}: {
  readonly rendered: NonNullable<EncryptedSecretFragmentPresentationProps["rendered"]>;
}) {
  const [revealed, setRevealed] = useState(false);
  const contentId = useId();
  const toggleLabel = t(revealed ? "e2ee.hideSecretFragment" : "e2ee.showSecretFragment");
  return (
    <span
      className={`relative inline-flex max-w-full items-start gap-1 rounded px-1 align-middle ${revealed ? "bg-transparent" : "bg-border-subtle"}`}
      data-encrypted-secret-state="ready"
    >
      <span className="inline-block h-5 w-4 shrink-0" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        appearance="ghost"
        variant="neutral"
        className={`!absolute inset-y-0 left-0 !h-auto !justify-start !rounded !bg-transparent !px-1 !py-0 !text-text-primary hover:!bg-transparent ${revealed ? "w-6" : "w-full"}`}
        aria-label={toggleLabel}
        aria-expanded={revealed}
        aria-controls={contentId}
        title={t("composer.secretSpoiler")}
        onClick={() => setRevealed((previous) => !previous)}
      >
        <Icon name="chatLock" size={13} />
      </Button>
      <span
        id={contentId}
        aria-hidden={!revealed}
        inert={!revealed}
        className={`min-w-0 transition-[filter] duration-150 ${revealed ? "" : "pointer-events-none select-none blur-[0.22rem]"}`}
      >
        {/* Nested secrets remain closed: arbitrary decrypted Markdown cannot recurse. */}
        <WorkspaceMessageBody
          html={rendered.html}
          metadata={rendered.metadata}
          useInlineMeta={false}
        />
      </span>
    </span>
  );
}
