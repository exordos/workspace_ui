import React from "react";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { SavedSnippetRow } from "./message-composer-saved-snippet-row.ui";
import type { MessageComposerSavedSnippetsDialogProps } from "./message-composer-saved-snippets-dialog.types";

export const MessageComposerSavedSnippetsDialog = React.memo(
  function MessageComposerSavedSnippetsDialog({
    dialogStyle,
    createMode,
    savedSnippetTitle,
    savedSnippetContent,
    savedSnippetsFilter,
    savedSnippetsLoading,
    savedSnippetsError,
    filteredSnippets,
    canSaveSnippet,
    onCloseBackdrop,
    onTitleChange,
    onContentChange,
    onFilterChange,
    onCancelCreate,
    onSubmitCreate,
    onSelectSnippet,
    onStartCreate,
  }: MessageComposerSavedSnippetsDialogProps) {
    return (
      <>
        <div className="fixed inset-0 z-dropdown" aria-hidden onClick={onCloseBackdrop} />
        <div
          className="fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          style={dialogStyle}
          role="dialog"
          data-testid="composer-saved-snippets-picker"
          aria-label={t("composer.savedSnippets")}
        >
          {createMode ? (
            <>
              <div className="border-b border-border-subtle px-3 py-2">
                <p className="text-sm font-medium text-text-primary">
                  {t("composer.createNewSavedSnippet")}
                </p>
              </div>
              <div className="space-y-2 px-3 py-3">
                <label
                  htmlFor="saved-snippet-title-input"
                  className="block text-xs font-medium text-text-muted"
                >
                  {t("composer.savedSnippetTitle")}
                </label>
                <input
                  id="saved-snippet-title-input"
                  value={savedSnippetTitle}
                  onChange={(event) => onTitleChange(event.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft"
                  aria-label={t("composer.savedSnippetTitle")}
                  placeholder={t("composer.savedSnippetTitle")}
                />
                <label
                  htmlFor="saved-snippet-content-input"
                  className="block text-xs font-medium text-text-muted"
                >
                  {t("composer.savedSnippetContent")}
                </label>
                <textarea
                  id="saved-snippet-content-input"
                  value={savedSnippetContent}
                  onChange={(event) => onContentChange(event.target.value)}
                  rows={6}
                  className={`w-full resize-none rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft ${SCROLL_AREA_CLASS}`}
                  aria-label={t("composer.savedSnippetContent")}
                  placeholder={t("composer.savedSnippetContent")}
                />
              </div>
              {savedSnippetsError != null && (
                <p className="px-3 pb-2 text-xs text-notice-base">{savedSnippetsError}</p>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-3 py-2">
                <button
                  type="button"
                  onClick={onCancelCreate}
                  className="rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg hover:text-text-primary"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void onSubmitCreate()}
                  disabled={!canSaveSnippet}
                  className="rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-border-subtle px-2 py-2">
                <input
                  value={savedSnippetsFilter}
                  onChange={(event) => onFilterChange(event.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft"
                  aria-label={t("composer.filterSnippets")}
                  placeholder={t("composer.filter")}
                />
              </div>
              {savedSnippetsError != null && (
                <p className="px-2 pt-2 text-xs text-notice-base">{savedSnippetsError}</p>
              )}
              <div
                className={`max-h-[250px] overflow-y-auto px-1 py-1 ${SCROLL_AREA_CLASS}`}
                role="list"
              >
                {savedSnippetsLoading ? (
                  <p className="px-2 py-3 text-sm text-text-muted">
                    {t("composer.savedSnippetsLoading")}
                  </p>
                ) : filteredSnippets.length > 0 ? (
                  filteredSnippets.map((snippet) => (
                    <SavedSnippetRow key={snippet.id} snippet={snippet} onSelect={onSelectSnippet} />
                  ))
                ) : (
                  <p className="px-2 py-3 text-sm text-text-muted">
                    {t("composer.savedSnippetsNoResults")}
                  </p>
                )}
              </div>
              <div className="border-t border-border-subtle px-2 py-2">
                <button
                  type="button"
                  onClick={onStartCreate}
                  className="w-full rounded-md px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg"
                >
                  {t("composer.createNewSavedSnippet")}
                </button>
              </div>
            </>
          )}
        </div>
      </>
    );
  },
);
