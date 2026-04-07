import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { Icon } from "~/shared/ui/icon";
import type { PlannedServiceCard, ServiceStubCardProps } from "./services-page.types";

const PLANNED_SERVICE_CARDS: PlannedServiceCard[] = [
  {
    id: "knowledge-base",
    icon: "files",
    titleKey: "settings.servicesPlaceholderKnowledgeBase",
    descriptionKey: "settings.servicesPlaceholderKnowledgeBaseHint",
  },
  {
    id: "people-directory",
    icon: "group",
    titleKey: "settings.servicesPlaceholderPeople",
    descriptionKey: "settings.servicesPlaceholderPeopleHint",
  },
  {
    id: "approvals",
    icon: "handshake",
    titleKey: "settings.servicesPlaceholderApprovals",
    descriptionKey: "settings.servicesPlaceholderApprovalsHint",
  },
  {
    id: "docs",
    icon: "folder",
    titleKey: "settings.servicesPlaceholderDocs",
    descriptionKey: "settings.servicesPlaceholderDocsHint",
  },
  {
    id: "automation",
    icon: "businessCenter",
    titleKey: "settings.servicesPlaceholderAutomation",
    descriptionKey: "settings.servicesPlaceholderAutomationHint",
  },
  {
    id: "integrations",
    icon: "links",
    titleKey: "settings.servicesPlaceholderIntegrations",
    descriptionKey: "settings.servicesPlaceholderIntegrationsHint",
  },
];

const ServiceStubCard = React.memo<ServiceStubCardProps>(({ card }) => {
  return (
    <li className="flex min-h-[170px] flex-col justify-between rounded-xl border border-border-subtle bg-card-bg p-4">
      <div className="space-y-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-subtle bg-bg">
          <Icon name={card.icon} size={22} className="text-text-muted" />
        </span>
        <div>
          <h2 className="text-sm font-medium text-text-primary">{t(card.titleKey)}</h2>
          <p className="mt-1 text-sm text-text-muted">{t(card.descriptionKey)}</p>
        </div>
      </div>
      <span className="mt-4 inline-flex w-fit rounded-md border border-border-subtle bg-bg px-2.5 py-1 text-xs text-text-muted">
        {t("settings.servicesComingSoon")}
      </span>
    </li>
  );
});

export const ServicesPage: React.FC = () => {
  const navigate = useNavigate();
  const openMessenger = useCallback(
    () => navigate(withCurrentOrgRoute("/stream/general")),
    [navigate],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border-subtle bg-card-bg px-4 py-4">
        <h1 className="text-lg font-semibold text-text-primary">{t("nav.services")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("settings.servicesPlannedHint")}</p>
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <ul className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto pb-1 md:grid-cols-2 xl:grid-cols-3">
          {PLANNED_SERVICE_CARDS.map((card) => (
            <ServiceStubCard key={card.id} card={card} />
          ))}
        </ul>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={openMessenger}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90"
          >
            {t("nav.chatsAndChannels")}
          </button>
        </div>
      </section>
    </div>
  );
};
