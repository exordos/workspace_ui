/**
 * Google Analytics 4 (gtag.js) provider.
 *
 * Loads the gtag.js script and sends events via the standard dataLayer.
 * Activated only when VITE_GA4_MEASUREMENT_ID is set.
 */

import { createLogger } from "../logger";
import type { AnalyticsProvider, EventProperties, UserTraits } from "./types";

const log = createLogger("analytics:ga4");

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

export function createGA4Provider(measurementId: string): AnalyticsProvider {
  let consentGranted = false;

  return {
    name: "ga4",

    init() {
      if (!measurementId) return;

      window.dataLayer = window.dataLayer || [];
      window.gtag = gtag;

      gtag("js", new Date());
      gtag("config", measurementId, {
        send_page_view: false,
        anonymize_ip: true,
      });

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.appendChild(script);

      log.info("GA4 initialized", { measurementId });
    },

    track(event: string, properties?: EventProperties) {
      if (!consentGranted || !measurementId) return;
      gtag("event", event, properties ?? {});
    },

    page(path: string, title?: string) {
      if (!consentGranted || !measurementId) return;
      gtag("event", "page_view", {
        page_path: path,
        page_title: title ?? document.title,
      });
    },

    identify(userId: string, traits?: UserTraits) {
      if (!consentGranted || !measurementId) return;
      gtag("config", measurementId, { user_id: userId });
      if (traits) {
        gtag("set", "user_properties", traits);
      }
    },

    reset() {
      if (!measurementId) return;
      gtag("config", measurementId, { user_id: undefined });
      gtag("set", "user_properties", {});
    },

    setConsent(granted: boolean) {
      consentGranted = granted;
      gtag("consent", "update", {
        analytics_storage: granted ? "granted" : "denied",
      });
    },
  };
}
