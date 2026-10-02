import React, { useRef, useState } from "react";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { EncryptedMessagePlaceholder } from "~/features/encrypted-chat-message/encrypted-message-placeholder.ui";
import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { EncryptedChatInfo } from "~/widgets/encrypted-chat-info/encrypted-chat-info.ui";

type PreviewState = "locked" | "loading" | "error";
const DEVICE_NAMES = ["iPhone 15", "MacBook Air", "Chrome", "Firefox"] as const;
const SERVICE_KINDS = ["key_request", "key_grant", "key_announced", "key_reject"] as const;
const SERVICE_LABELS = {
  key_request: "keyRequestTitle",
  key_grant: "keyGrantTitle",
  key_announced: "keyAnnouncedTitle",
  key_reject: "keyRejectTitle",
} as const;
const PLACEHOLDER_LABELS = {
  locked: { title: "lockedTitle", description: "lockedDescription" },
  loading: { title: "loadingTitle", description: "loadingDescription" },
  error: { title: "decryptErrorTitle", description: "decryptErrorDescription" },
} as const;

/** Local presentation fixtures never enter the messenger store or key storage. */
export function EncryptedChatPreview(): React.ReactElement {
  const { t, locale, setLocale } = useTranslation();
  const [state, setState] = useState<PreviewState>("locked");
  const [administrator, setAdministrator] = useState(true);
  const [hasKey, setHasKey] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const openPanelRef = useRef<HTMLButtonElement>(null);
  const unsupported = () => setNotice(t("e2ee.previewUnavailable"));
  const actionsEnabled = administrator && hasKey && state !== "loading";
  const requests = DEVICE_NAMES.map((deviceName, index) => ({
    requestMessageUuid: `preview-request-${index}`,
    name: t("e2ee.previewPerson"),
    deviceName,
    pending: state === "loading",
    canGrant: actionsEnabled,
    canReject: administrator && state !== "loading",
  }));
  const members = Array.from({ length: 5 }, (_, index) => ({
    id: `preview-member-${index}`,
    name: t("e2ee.previewPerson"),
    statusLabel: t("e2ee.previewLastSeen"),
    roleLabel: index === 0 ? t("common.you") : null,
  }));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="h-full overflow-auto bg-bg p-4 text-text-primary"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">{t("e2ee.previewTitle")}</h1>
          <p className="text-sm text-text-muted">{t("e2ee.previewDescription")}</p>
        </header>
        <fieldset className="flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle p-3">
          <legend className="px-1 text-sm">{t("e2ee.previewControls")}</legend>
          <label className="flex items-center gap-2 text-sm">
            {t("e2ee.previewState")}
            <select
              className="rounded border border-border-subtle bg-bg-elevated p-2"
              value={state}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "locked" || value === "loading" || value === "error") setState(value);
                setNotice(null);
              }}
            >
              <option value="locked">{t("e2ee.lockedTitle")}</option>
              <option value="loading">{t("e2ee.loadingTitle")}</option>
              <option value="error">{t("e2ee.decryptErrorTitle")}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={administrator}
              onChange={(e) => setAdministrator(e.target.checked)}
            />
            {t("e2ee.previewAdministrator")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasKey} onChange={(e) => setHasKey(e.target.checked)} />
            {t("e2ee.previewKey")}
          </label>
          <Button
            type="button"
            size="sm"
            appearance="outline"
            onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
          >
            {locale === "ru" ? "English" : "Русский"}
          </Button>
          <Button
            ref={openPanelRef}
            type="button"
            size="sm"
            appearance="outline"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(true)}
          >
            {t("e2ee.openPanel")}
          </Button>
        </fieldset>
        {notice ? (
          <p role="status" className="text-sm text-text-muted">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <section
            aria-label={t("e2ee.previewMessages")}
            className="w-full min-w-0 space-y-4 lg:flex-1"
          >
            <EncryptedMessagePlaceholder
              state={state}
              title={t(`e2ee.${PLACEHOLDER_LABELS[state].title}`)}
              description={t(`e2ee.${PLACEHOLDER_LABELS[state].description}`)}
              action={{
                label: t(state === "error" ? "e2ee.retry" : "e2ee.requestAccess"),
                onClick: unsupported,
              }}
            />
            {SERVICE_KINDS.map((kind) => (
              <EncryptedChatServiceMessage
                key={kind}
                kind={kind}
                title={t(`e2ee.${SERVICE_LABELS[kind]}`)}
                deviceName={kind === "key_request" ? DEVICE_NAMES[0] : undefined}
                description={kind === "key_grant" ? t("e2ee.grantReceivedDescription") : undefined}
                actions={
                  kind === "key_request"
                    ? [
                        {
                          label: t("e2ee.grantAccess"),
                          onClick: unsupported,
                          disabled: !actionsEnabled,
                        },
                        {
                          label: t("e2ee.rejectAccess"),
                          onClick: unsupported,
                          disabled: !administrator || state === "loading",
                          variant: "danger",
                        },
                      ]
                    : undefined
                }
              />
            ))}
          </section>
          {panelOpen ? (
            <div className="h-[984px] w-[299px] max-w-full shrink-0">
              <EncryptedChatInfo
                title={t("e2ee.previewChatName")}
                participantsCount={5}
                onlineCount={2}
                keyInfo={
                  hasKey
                    ? { name: t("e2ee.previewKeyName"), createdLabel: t("e2ee.previewCreated") }
                    : null
                }
                requests={requests}
                members={members}
                showKeyManagement={administrator}
                loading={state === "loading"}
                error={state === "error" ? t("e2ee.decryptErrorDescription") : null}
                canRotateKey={actionsEnabled}
                canGrantAll={actionsEnabled}
                onClose={() => {
                  setPanelOpen(false);
                  openPanelRef.current?.focus();
                }}
                onCopyKey={unsupported}
                onRotateKey={unsupported}
                onGrantAll={unsupported}
                onGrantRequest={unsupported}
                onRejectRequest={unsupported}
                onOpenSettings={unsupported}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
