import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

const CALLS_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";

export const CallsPage: React.FC = () => {
  const callsTitle = t("call.recentCalls");

  return (
    <div className="flex max-h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <Icon name="phone" size={18} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">{callsTitle}</h2>
        </div>
        <div className={`${CALLS_STATE_CARD_CLASS} text-text-muted`}>{t("call.noRecentCalls")}</div>
      </section>
    </div>
  );
};
