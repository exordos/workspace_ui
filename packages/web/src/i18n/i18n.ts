/**
 * Internationalization module.
 *
 * Lightweight i18n without heavy dependencies.
 * Supports: nested keys, interpolation ({{var}}), plurals (_one/_few/_many/_other).
 *
 * Usage:
 *   import { t, setLocale, getLocale } from "~/i18n/i18n";
 *
 *   t("auth.login")                        → "Login"
 *   t("presence.minutesAgo", { count: 5 }) → "5 min ago"
 *   t("message.selected", { count: 3 })    → "3 messages" (plural)
 *
 * React hook:
 *   import { useTranslation } from "~/i18n/i18n";
 *   const { t, locale, setLocale } = useTranslation();
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  buildOrgScopedStorageKey,
  getActiveOrganizationIdFromStorage,
} from "~/shared/lib/org-scoped-storage";
import enMessages from "./locales/en.json";
import ruMessages from "./locales/ru.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = "ru" | "en";

type Messages = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const MESSAGES: Record<Locale, Messages> = {
  ru: ruMessages as Messages,
  en: enMessages as Messages,
};

const LOCALE_STORAGE_KEY = "workspace-locale";
const DEFAULT_LOCALE: Locale = "en";

const SUPPORTED_LOCALES: readonly { id: Locale; label: string; nativeLabel: string }[] = [
  { id: "ru", label: "Russian", nativeLabel: "Русский" },
  { id: "en", label: "English", nativeLabel: "English" },
];

// ---------------------------------------------------------------------------
// State (reactive, no external deps)
// ---------------------------------------------------------------------------

let currentLocale: Locale = loadLocale();
const subscribers = new Set<() => void>();

function loadLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const activeOrganizationId = getActiveOrganizationIdFromStorage();
    const scopedKey = buildOrgScopedStorageKey(LOCALE_STORAGE_KEY, activeOrganizationId);
    const legacyFallbackKey = scopedKey === LOCALE_STORAGE_KEY ? null : LOCALE_STORAGE_KEY;
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = legacyFallbackKey ? localStorage.getItem(legacyFallbackKey) : null;
    const stored = (scopedValue ?? legacyValue) as Locale | null;
    if (scopedValue == null && legacyValue != null && legacyFallbackKey != null) {
      localStorage.setItem(scopedKey, legacyValue);
    }
    if (stored && stored in MESSAGES) return stored;
  } catch {
    /* restricted storage */
  }
  const browser = navigator.language.slice(0, 2) as Locale;
  return browser in MESSAGES ? browser : DEFAULT_LOCALE;
}

function notify() {
  subscribers.forEach((cb) => cb());
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (!(locale in MESSAGES)) return;
  currentLocale = locale;
  if (typeof window !== "undefined") {
    try {
      const activeOrganizationId = getActiveOrganizationIdFromStorage();
      const scopedKey = buildOrgScopedStorageKey(LOCALE_STORAGE_KEY, activeOrganizationId);
      localStorage.setItem(scopedKey, locale);
    } catch {
      /* restricted storage */
    }
    document.documentElement.lang = locale;
  }
  notify();
}

export function getSupportedLocales() {
  return SUPPORTED_LOCALES;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

function resolve(obj: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function selectPlural(locale: Locale, count: number): string {
  if (locale === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "few";
    return "many";
  }
  return count === 1 ? "one" : "other";
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val == null) return `{{${key}}}`;
    return typeof val === "object" ? JSON.stringify(val) : String(val as string | number | boolean);
  });
}

export function t(key: string, vars?: Record<string, unknown>): string {
  const messages = MESSAGES[currentLocale] ?? MESSAGES[DEFAULT_LOCALE];

  let value: string | undefined;

  if (vars && "count" in vars) {
    const count = Number(vars.count);
    const pluralKey = selectPlural(currentLocale, count);
    value = resolve(messages, `${key}_${pluralKey}`);
    if (value == null || value.length === 0) {
      value = resolve(messages, `${key}_other`);
    }
  }

  if (value == null || value.length === 0) {
    value = resolve(messages, key);
  }

  if (value == null || value.length === 0) {
    const fallback = MESSAGES[DEFAULT_LOCALE];
    value = resolve(fallback, key);
  }

  if (!value) return key;

  return vars ? interpolate(value, vars) : value;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useTranslation() {
  const locale = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => currentLocale,
  );

  const translate = useCallback(
    (key: string, vars?: Record<string, unknown>) => t(key, vars),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` closes over module locale; `locale` is the only external input that must invalidate the callback when switching language.
    [locale],
  );

  return {
    t: translate,
    locale,
    setLocale,
    supportedLocales: SUPPORTED_LOCALES,
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

if (typeof document !== "undefined") {
  document.documentElement.lang = currentLocale;
}
