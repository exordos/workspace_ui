import React from "react";
import { t } from "~/i18n/i18n";
import type { ShortcutHelpSection } from "./app-shortcuts-help.lib";

export interface AppShortcutsHelpModalProps {
  sections: ShortcutHelpSection[];
  onClose: () => void;
}

export const AppShortcutsHelpModal: React.FC<AppShortcutsHelpModalProps> = ({
  sections,
  onClose,
}) => (
  <div
    className="bg-bg/80 fixed inset-0 z-modal flex items-center justify-center p-4"
    data-shortcut-context="modal"
    role="dialog"
    aria-modal="true"
    aria-label={t("shortcuts.title")}
  >
    <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">{t("shortcuts.title")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-text-muted hover:bg-bg hover:text-text-primary"
          aria-label={t("common.close")}
        >
          {t("common.close")}
        </button>
      </div>
      <div className="grid gap-4 overflow-y-auto p-4 md:grid-cols-2">
        {sections.map((section) => (
          <section key={section.category} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {section.category}
            </h3>
            <div className="space-y-1.5">
              {section.entries.map((entry) => (
                <div
                  key={`${section.category}-${entry.label}-${entry.combo}`}
                  className="flex items-center justify-between gap-2 rounded bg-bg px-2 py-1.5 text-xs text-text-primary"
                >
                  <span className="truncate">{entry.label}</span>
                  <kbd className="rounded border border-border-subtle bg-card-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                    {entry.combo}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  </div>
);
