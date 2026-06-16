import React from "react";
import { isMailApiConfigured } from "~/entities/mail/mail.lib";
import { t } from "~/i18n/i18n";
import { env } from "~/shared/lib/env";
import { Icon } from "~/shared/ui/icon";
import { MailView } from "~/widgets/mail-view/mail-view.ui";
import { useMailPageBootstrap } from "./mail-page.hook";

export const MailPage: React.FC = () => {
  useMailPageBootstrap();
  if (!isMailApiConfigured(env.MAIL_API_ORIGIN)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
        <Icon name="mail" size={64} className="opacity-50" />
        <h2 className="text-xl font-medium text-text-primary">{t("nav.mail")}</h2>
        <p className="max-w-lg text-center text-sm">{t("mail.notConfigured")}</p>
      </div>
    );
  }

  return <MailView />;
};
