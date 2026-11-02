import React, { useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import {
  HOTKEYS,
  FIXED_HOTKEYS,
  getHotkeyBinding,
  formatHotkey,
  hotkeyFromEvent,
  useHotkeySettings,
  validateHotkeyBinding,
} from "~/shared/lib/hotkeys";
import type { HotkeyId } from "~/shared/lib/hotkeys";
import { AppDialog } from "~/shared/ui/app-dialog";
import { Button } from "~/shared/ui/button";
import { SearchInput } from "~/shared/ui/search-input";

export function HotkeySettingsDialog({
  onClose,
  onCloseAutoFocus,
}: {
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const { overrides, enabled, onOverridesChange, onEnabledChange } = useHotkeySettings();
  const opener = useRef<HTMLButtonElement | null>(null);
  const recordInput = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<HotkeyId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const recordKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape closes the dialog and Tab moves focus between its controls.
    if (event.key === "Escape" || event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    const binding = hotkeyFromEvent(event.nativeEvent);
    if (binding == null || recording == null) return;
    setCandidate(binding);
    setError(validateHotkeyBinding(recording, binding, overrides));
  };
  const save = () => {
    if (recording == null || candidate == null) return;
    const failure = validateHotkeyBinding(recording, candidate, overrides);
    if (failure != null) {
      setError(failure);
      return;
    }
    if (!onOverridesChange({ ...overrides, [recording]: candidate })) {
      setError("storageError");
      return;
    }
    setRecording(null);
    setError(null);
  };
  const change = (next: typeof overrides) => {
    if (!onOverridesChange(next)) setError("storageError");
    else setError(null);
  };
  const search = query.trim().toLocaleLowerCase();
  const matches = (item: { labelKey: string }) =>
    t(item.labelKey).toLocaleLowerCase().includes(search);
  const filtered = HOTKEYS.filter(matches);
  const fixed = FIXED_HOTKEYS.filter(matches);
  const selected = HOTKEYS.find((item) => item.id === recording);
  const closeEditor = () => {
    setRecording(null);
    setError(null);
  };
  const resetSelected = () => {
    if (selected == null) return;
    const next = { ...overrides };
    delete next[selected.id];
    // The default key may now be used by another action.
    if (selected.defaultBinding != null) {
      const failure = validateHotkeyBinding(selected.id, selected.defaultBinding, next);
      if (failure != null) {
        setError(failure);
        return;
      }
    }
    if (!onOverridesChange(next)) {
      setError("storageError");
      return;
    }
    closeEditor();
  };
  const kbdClass =
    "shrink-0 whitespace-nowrap rounded border border-border-subtle bg-card-bg px-1.5 py-0.5 font-mono text-[11px] text-text-primary";
  return (
    <>
      <AppDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t("hotkeys.title")}
        maxWidthClassName="max-w-3xl"
        scrollBody
        positionClassName="top-1/2 -translate-y-1/2"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-text-secondary">{t("hotkeys.localDescription")}</p>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("hotkeys.search")}
            ariaLabel={t("hotkeys.search")}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  if (!onEnabledChange(event.target.checked)) setError("storageError");
                  else setError(null);
                }}
              />{" "}
              {t("hotkeys.enabled")}
            </label>
            <Button size="sm" appearance="outline" onClick={() => change({})}>
              {t("hotkeys.resetAll")}
            </Button>
          </div>
          {error != null && recording == null ? <p role="alert">{t(`hotkeys.${error}`)}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {(["navigation", "interface", "composer"] as const).map((category) => {
              const items = filtered.filter((item) => item.category === category);
              if (items.length === 0) return null;
              return (
                <section key={category} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {t(`hotkeys.${category}`)}
                  </h2>
                  <div className="space-y-1.5">
                    {items.map((item) => {
                      const binding = getHotkeyBinding(item.id, overrides);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className="flex w-full items-center justify-between gap-2 rounded bg-bg px-2 py-1.5 text-left text-xs text-text-primary hover:bg-sidebar-hover"
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            setError(null);
                            setCandidate(null);
                            setRecording(item.id);
                          }}
                        >
                          <span className="min-w-0">
                            {t(item.labelKey)}
                            {item.id === "composer.editLastMessage" ? (
                              <span className="block text-text-secondary">
                                {t("hotkeys.editLastMessageHint")}
                              </span>
                            ) : null}
                          </span>
                          <kbd className={kbdClass}>
                            {binding == null ? t("hotkeys.disabled") : formatHotkey(binding)}
                          </kbd>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {fixed.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("hotkeys.fixedTitle")}
                </h2>
                <div className="space-y-1.5">
                  {fixed.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded bg-bg px-2 py-1.5 text-xs"
                    >
                      <span>{t(item.labelKey)}</span>
                      <kbd className={kbdClass}>{formatHotkey(item.binding)}</kbd>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          {filtered.length === 0 && fixed.length === 0 ? <p>{t("hotkeys.empty")}</p> : null}
        </div>
      </AppDialog>
      <AppDialog
        open={recording != null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        onOpenAutoFocus={(event) => {
          // Focus the recording field instead of the dialog close button.
          event.preventDefault();
          recordInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Return focus to the action that opened the editor.
          event.preventDefault();
          opener.current?.focus();
        }}
        title={
          selected == null ? t("hotkeys.edit") : `${t("hotkeys.edit")}: ${t(selected.labelKey)}`
        }
        description={t("hotkeys.record")}
      >
        <div className="space-y-4">
          <input
            ref={recordInput}
            readOnly
            aria-label={t("hotkeys.recordInput")}
            placeholder={t("hotkeys.recordInput")}
            value={candidate == null ? "" : formatHotkey(candidate)}
            onKeyDown={recordKey}
            className="w-full rounded-lg border border-border-subtle bg-text-field-bg p-2 text-text-primary outline-none placeholder:text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {error != null ? <p role="alert">{t(`hotkeys.${error}`)}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={save}
              disabled={candidate == null || (error != null && error !== "storageError")}
            >
              {t("hotkeys.save")}
            </Button>
            <Button
              appearance="outline"
              onClick={() => {
                if (recording == null) return;
                if (!onOverridesChange({ ...overrides, [recording]: null })) {
                  setError("storageError");
                  return;
                }
                closeEditor();
              }}
            >
              {t("hotkeys.disable")}
            </Button>
            <Button appearance="outline" onClick={resetSelected}>
              {t("hotkeys.reset")}
            </Button>
          </div>
        </div>
      </AppDialog>
    </>
  );
}
