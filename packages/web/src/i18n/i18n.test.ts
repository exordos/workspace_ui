/**
 * Tests for the i18n module — lightweight internationalization (ru + en).
 *
 * Covers key resolution, variable interpolation, Russian and English plural
 * forms, locale switching, the useTranslation React hook, and edge cases
 * like missing keys and unsupported locales. Correctness here prevents
 * broken UI text across the entire application.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  configureI18nStorageScope,
  t,
  setLocale,
  getLocale,
  getSupportedLocales,
  useTranslation,
} from "./i18n";
import type { I18nStorageScope } from "./i18n";

let currentTestScope: I18nStorageScope = { scopeKey: null, legacyScopeKey: null };
let emitScopeChange: (() => void) | null = null;

function configureTestStorageScope(scope: I18nStorageScope): void {
  currentTestScope = scope;
  configureI18nStorageScope({
    getScope: () => currentTestScope,
    subscribe: (onScopeChange) => {
      emitScopeChange = onScopeChange;
      return () => {
        if (emitScopeChange === onScopeChange) {
          emitScopeChange = null;
        }
      };
    },
  });
}

function setTestStorageScope(scope: I18nStorageScope): void {
  currentTestScope = scope;
  emitScopeChange?.();
}

// Core translation function, plural rules, locale switching, and React hook.
describe("i18n", () => {
  beforeEach(() => {
    localStorage.removeItem("workspace-locale");
    localStorage.removeItem("workspace-locale:owner-a");
    localStorage.removeItem("workspace-locale:owner-b");
    localStorage.removeItem("workspace-locale:instance-a");
    localStorage.removeItem("workspace-locale:instance-b");
    configureI18nStorageScope();
    setLocale("en");
  });

  // t() is the main translation function used everywhere in the app.
  describe("t()", () => {
    // Simple flat key (section.key) must resolve to the English string.
    it("resolves simple key", () => {
      expect(t("auth.login")).toBe("Login");
    });

    // Nested keys (nav.messenger) must also resolve correctly.
    it("resolves nested key", () => {
      expect(t("nav.messenger")).toBe("Messenger");
    });

    // Missing keys return the key itself so devs can spot untranslated strings.
    it("returns key when not found", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });

    // {{variable}} placeholders must be replaced with provided values.
    it("interpolates variables", () => {
      expect(t("update.available", { version: "1.2.3" })).toBe("Version 1.2.3 available");
    });

    // Missing variable must leave the {{placeholder}} visible for debugging.
    it("handles missing variable gracefully", () => {
      expect(t("update.available")).toBe("Version {{version}} available");
    });
  });

  // Russian has 3 plural forms (_one, _few, _many) — complex rules that are easy to break.
  describe("plurals (Russian)", () => {
    beforeEach(() => setLocale("ru"));

    // Russian locale: testing Russian plural forms (_one, _few, _many)
    it("uses _one for 1", () => {
      expect(t("presence.daysAgo", { count: 1 })).toBe("1 день назад");
    });

    it("uses _few for 2-4", () => {
      expect(t("presence.daysAgo", { count: 3 })).toBe("3 дня назад");
    });

    it("uses _many for 5+", () => {
      expect(t("presence.daysAgo", { count: 7 })).toBe("7 дней назад");
    });

    // 11-14 are special in Russian — they use _many, not _one/_few.
    it("uses _many for 11-14", () => {
      expect(t("presence.daysAgo", { count: 12 })).toBe("12 дней назад");
    });

    // 21, 31, 41… use _one form in Russian (unlike English).
    it("uses _one for 21", () => {
      expect(t("presence.daysAgo", { count: 21 })).toBe("21 день назад");
    });
  });

  // Locale switching affects all subsequent t() calls app-wide.
  describe("locale switching", () => {
    // Default locale must be English for international users.
    it("defaults to en", () => {
      expect(getLocale()).toBe("en");
    });

    // Switching to Russian must change all translations immediately.
    it("switches to ru", () => {
      setLocale("ru");
      expect(t("auth.login")).toBe("Войти");
      expect(getLocale()).toBe("ru");
    });

    // Switching back must fully restore English translations.
    it("switches back to en", () => {
      setLocale("ru");
      setLocale("en");
      expect(t("auth.login")).toBe("Login");
    });

    // Missing keys still return the key regardless of locale.
    it("returns key when not found", () => {
      setLocale("en");
      const result = t("nonexistent.key");
      expect(result).toBe("nonexistent.key");
    });

    it("stores locale scoped to configured storage scope", () => {
      configureTestStorageScope({ scopeKey: "owner-a", legacyScopeKey: "instance-a" });

      setLocale("ru");
      expect(localStorage.getItem("workspace-locale:owner-a")).toBe("ru");
      expect(localStorage.getItem("workspace-locale")).toBe("en");
    });

    it("loads locale when configured storage scope changes", () => {
      localStorage.setItem("workspace-locale:owner-a", "ru");
      localStorage.setItem("workspace-locale:owner-b", "en");

      configureTestStorageScope({ scopeKey: "owner-a", legacyScopeKey: "instance-a" });
      expect(getLocale()).toBe("ru");

      setTestStorageScope({ scopeKey: "owner-b", legacyScopeKey: "instance-b" });
      expect(getLocale()).toBe("en");
    });

    it("reads legacy instance-scoped locale without writing back to legacy keys", () => {
      localStorage.setItem("workspace-locale:instance-a", "ru");

      configureTestStorageScope({ scopeKey: "owner-a", legacyScopeKey: "instance-a" });
      expect(getLocale()).toBe("ru");

      setLocale("en");

      expect(localStorage.getItem("workspace-locale:owner-a")).toBe("en");
      expect(localStorage.getItem("workspace-locale:instance-a")).toBe("ru");
    });
  });

  // English has 2 plural forms (_one, _other) — simpler than Russian.
  describe("plurals (English)", () => {
    beforeEach(() => setLocale("en"));

    it("uses _one for 1", () => {
      expect(t("presence.daysAgo", { count: 1 })).toBe("1 day ago");
    });

    it("uses _other for 2+", () => {
      expect(t("presence.daysAgo", { count: 5 })).toBe("5 days ago");
    });
  });

  // getSupportedLocales is used by the language switcher in settings.
  describe("getSupportedLocales", () => {
    // Must return exactly the two supported locales.
    it("returns ru and en", () => {
      const locales = getSupportedLocales();
      expect(locales).toHaveLength(2);
      expect(locales.map((l) => l.id)).toContain("ru");
      expect(locales.map((l) => l.id)).toContain("en");
    });
  });

  // Edge case: unsupported locales must be silently rejected.
  describe("setLocale edge cases", () => {
    // Passing an invalid locale code must not change the current locale.
    it("ignores unsupported locale value", () => {
      setLocale("en");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLocale("zz" as any);
      expect(getLocale()).toBe("en");
    });

    it("loads locale from configured storage scope on init", async () => {
      localStorage.setItem("workspace-locale:owner-b", "ru");

      vi.resetModules();
      const { configureI18nStorageScope: configureFreshScope, getLocale: getFreshLocale } =
        await import("./i18n");
      configureFreshScope({ getScope: () => ({ scopeKey: "owner-b" }) });
      expect(getFreshLocale()).toBe("ru");
    });
  });

  // useTranslation is the React hook that provides i18n to components.
  describe("useTranslation", () => {
    // The hook must expose all i18n utilities components need.
    it("returns t, locale, setLocale, and supportedLocales", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.t).toBeInstanceOf(Function);
      expect(result.current.locale).toBe("en");
      expect(result.current.setLocale).toBeInstanceOf(Function);
      expect(result.current.supportedLocales).toHaveLength(2);
    });

    // The hook's t() must behave identically to the standalone t().
    it("t function translates keys", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.t("auth.login")).toBe("Login");
    });

    // Locale change must trigger a re-render so components show the new language.
    it("reacts to locale changes", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.locale).toBe("en");

      act(() => {
        result.current.setLocale("ru");
      });

      expect(result.current.locale).toBe("ru");
      // Russian locale: testing that t() returns Russian when locale is ru
      expect(result.current.t("auth.login")).toBe("Войти");
    });
  });
});
