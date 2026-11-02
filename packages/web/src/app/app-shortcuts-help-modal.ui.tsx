import React from "react";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog";
import type { ShortcutHelpSection } from "./app-shortcuts-help.lib";

export interface AppShortcutsHelpModalProps {
  sections: ShortcutHelpSection[];
  onClose: () => void;
}

export const AppShortcutsHelpModal: React.FC<AppShortcutsHelpModalProps> = ({
  sections,
  onClose,
}) => (
  <AppDialog
    open
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
    title={t("shortcuts.title")}
    maxWidthClassName="max-w-3xl"
    scrollBody
    positionClassName="top-1/2 -translate-y-1/2"
    onCloseAutoFocus={() => {}}
  >
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
                <kbd className="rounded border border-border-subtle bg-card-bg px-1.5 py-0.5 font-mono text-[11px] text-text-primary">
                  {entry.combo}
                </kbd>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  </AppDialog>
);
