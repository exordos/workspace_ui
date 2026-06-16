import React from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";

export interface MailViewToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onComposeOpen: () => void;
  onSignOut: () => void;
}

export const MailViewToolbar: React.FC<MailViewToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onComposeOpen,
  onSignOut,
}) => (
  <header className="relative z-sticky mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
    <h1 className="text-lg font-medium text-text-primary">{t("nav.mail")}</h1>
    <div className="flex items-center gap-2">
      <SearchInput
        value={searchQuery}
        onChange={onSearchChange}
        placeholder={t("mail.searchPlaceholder")}
        ariaLabel={t("mail.searchPlaceholder")}
        size="sm"
        clearable={false}
        iconPosition="left"
        className="w-36"
      />
      <Button type="button" size="sm" variant="ghost" onClick={onSignOut} className="shrink-0">
        {t("mail.signOut")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={onComposeOpen}
        className="shrink-0 gap-1.5 text-on-accent hover:opacity-90"
      >
        <Icon name="mail" size={16} className="text-on-accent" />
        <span>{t("mail.compose")}</span>
      </Button>
    </div>
  </header>
);
