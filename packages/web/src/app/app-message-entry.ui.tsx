import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { t, useTranslation } from "~/i18n/i18n";
import { getElectronAPI } from "~/shared/lib/electron";
import { isWebView } from "~/shared/lib/webview";
import { buildWorkspaceMessageDesktopLink } from "~/shared/lib/workspace-message-permalink.lib";
import {
  parseWorkspaceMessengerMessageAnchor,
  parseWorkspaceMessengerRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Button } from "~/shared/ui/button";
import {
  isMessageEntryMobileBrowser,
  readMessageOpenPreference,
  writeMessageOpenPreference,
} from "./app-message-entry.lib";

let attemptedEntry: string | null = null;

export function AppMessageEntry({ children }: { readonly children: ReactNode }) {
  useTranslation();
  const location = useLocation();
  const [entry] = useState(() => {
    if (getElectronAPI() != null || isWebView() || isMessageEntryMobileBrowser(navigator))
      return null;
    const route = parseWorkspaceMessengerRoute(location.pathname);
    return route?.kind === "message" ? { ...route, path: location.pathname } : null;
  });
  const [prefersDesktop, setPrefersDesktop] = useState(() => {
    if (entry == null) return false;
    try {
      return readMessageOpenPreference(window.localStorage, entry.orgId) === "desktop";
    } catch {
      return false;
    }
  });
  const [waiting, setWaiting] = useState(
    () => prefersDesktop && window.history.state?.workspaceMessageAppWeb !== entry?.path,
  );
  const [dismissed, setDismissed] = useState(false);
  const currentRoute = parseWorkspaceMessengerRoute(location.pathname);
  const sameMessage =
    entry != null &&
    currentRoute?.orgId === entry.orgId &&
    currentRoute.projectId === entry.projectId &&
    (currentRoute.kind === "message"
      ? currentRoute.messageUuid === entry.messageUuid
      : (currentRoute.kind === "stream" || currentRoute.kind === "topic") &&
        parseWorkspaceMessengerMessageAnchor(location.hash) === entry.messageUuid);

  if (entry != null && !sameMessage && !dismissed) setDismissed(true);

  const openDesktop = () => {
    if (entry == null) return;
    const url = buildWorkspaceMessageDesktopLink(entry);
    if (url != null) {
      try {
        window.location.assign(url);
      } catch {
        /* Keep the web fallback available if protocol navigation is rejected. */
      }
    }
  };
  useEffect(() => {
    if (!waiting || entry == null || attemptedEntry === entry.path) return;
    attemptedEntry = entry.path;
    // The marker survives reload/back; it never changes the remembered preference.
    const marker = "workspaceMessageAppAttempt";
    if (window.history.state?.[marker] === entry.path) return;
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "reload" || navigation?.type === "back_forward") return;
    try {
      window.history.replaceState({ ...window.history.state, [marker]: entry.path }, "");
    } catch {
      return;
    }
    const url = buildWorkspaceMessageDesktopLink(entry);
    if (url != null) {
      try {
        window.location.assign(url);
      } catch {
        /* Keep the web fallback available if protocol navigation is rejected. */
      }
    }
  }, [entry, waiting]);

  if (entry == null) return <>{children}</>;
  const showEntry = !dismissed && sameMessage;
  const remember = (preference: "desktop" | "browser") => {
    try {
      writeMessageOpenPreference(window.localStorage, entry.orgId, preference);
    } catch {
      /* Storage can be disabled by the browser. */
    }
    setPrefersDesktop(preference === "desktop");
    if (preference === "desktop") {
      attemptedEntry = entry.path;
      setWaiting(true);
      openDesktop();
    } else continueWeb();
  };
  function continueWeb() {
    try {
      window.history.replaceState(
        { ...window.history.state, workspaceMessageAppWeb: entry?.path },
        "",
      );
    } catch {
      /* Continuing in this document does not require history storage. */
    }
    setWaiting(false);
  }
  return (
    <div className="flex h-full flex-col bg-bg text-text-primary">
      {showEntry && (
        <section
          aria-label={t("messageLinkEntry.title")}
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-bg-elevated p-3"
        >
          <span className="text-sm">{t("messageLinkEntry.title")}</span>
          <Button size="sm" onClick={openDesktop}>
            {t("messageLinkEntry.openApp")}
          </Button>
          {!prefersDesktop && (
            <Button size="sm" appearance="ghost" onClick={() => remember("desktop")}>
              {t("messageLinkEntry.alwaysApp")}
            </Button>
          )}
          {waiting && (
            <Button size="sm" appearance="outline" onClick={continueWeb}>
              {t("messageLinkEntry.continueWeb")}
            </Button>
          )}
          {prefersDesktop && (
            <Button size="sm" appearance="ghost" onClick={() => remember("browser")}>
              {t("messageLinkEntry.alwaysWeb")}
            </Button>
          )}
        </section>
      )}
      {(!showEntry || !waiting) && (
        <div key="web-content" className="min-h-0 flex-1">
          {children}
        </div>
      )}
    </div>
  );
}
