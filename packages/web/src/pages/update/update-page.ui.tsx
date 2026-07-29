import React, { useEffect, useMemo, useRef } from "react";
import { t } from "~/i18n/i18n";
import { useAppUpdate, type UpdateState } from "~/shared/lib/updater";
import { ChatChannelHeader } from "~/widgets/chat-view/chat-header-channel.ui";
import type { UpdatePageProps } from "./update-page.types";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

function getUpdateStatusText(update: UpdateState): string {
  switch (update.status) {
    case "checking":
      return t("update.checking");
    case "available":
      return t("update.available", { version: update.version ?? "?" });
    case "downloading":
      return t("update.downloading", { percent: Math.round(update.percent ?? 0) });
    case "ready":
      return t("update.readyToInstall");
    case "up-to-date":
      return t("update.upToDate");
    case "error":
      return update.error?.trim() ? update.error : t("update.error");
    case "idle":
    default:
      return t("update.upToDate");
  }
}

export const UpdatePage: React.FC<UpdatePageProps> = ({ forceMode = false }) => {
  const update = useAppUpdate();
  const autoCheckTriggeredRef = useRef(false);
  const statusText = useMemo(() => getUpdateStatusText(update), [update]);
  const canCheck = update.status !== "checking" && update.status !== "downloading";

  useEffect(() => {
    if (autoCheckTriggeredRef.current) {
      return;
    }
    if (forceMode && update.status === "ready") {
      return;
    }
    autoCheckTriggeredRef.current = true;
    update.check();
  }, [update, forceMode]);

  return (
    <div className="flex max-h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ChatChannelHeader
        channelName={forceMode ? t("update.forceRequiredTitle") : t("settings.selectBuild")}
        hideTopic
        hideParticipants
      />
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="rounded-xl border border-border-subtle bg-card-bg p-4">
          <p className="text-sm text-text-muted">
            {t("update.currentVersion", { version: APP_VERSION })}
          </p>
          <p className="mt-2 text-sm text-text-primary">{statusText}</p>
          {forceMode ? (
            <p className="mt-2 text-xs text-notice-base">{t("update.forceRequiredHint")}</p>
          ) : null}
          {update.status === "available" && update.version ? (
            <p className="mt-2 text-xs text-text-muted">
              {t("settings.newVersion", { version: update.version })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={update.check}
            disabled={!canCheck}
            className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg disabled:opacity-50"
          >
            {t("update.check")}
          </button>
          {update.status === "ready" ? (
            <button
              type="button"
              onClick={update.install}
              className="rounded-lg bg-accent px-3 py-2 text-sm text-on-accent hover:opacity-90"
            >
              {t("update.install")}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
};
