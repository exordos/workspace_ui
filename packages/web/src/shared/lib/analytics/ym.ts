/**
 * Yandex Metrika provider.
 *
 * Loads the Yandex.Metrika tag and sends events via ym() global.
 * Activated only when VITE_YM_COUNTER_ID is set.
 *
 * Supports:
 * - reachGoal (track)
 * - hit (page)
 * - userParams (identify)
 * - Webvisor, click map, scroll map (configured via init)
 */

import { createLogger } from "../logger";
import type { AnalyticsProvider, EventProperties, UserTraits } from "./types";

const log = createLogger("analytics:ym");

declare global {
  interface Window {
    ym: (counterId: number, method: string, ...args: unknown[]) => void;
  }
}

export function createYMProvider(counterId: number): AnalyticsProvider {
  let consentGranted = false;

  function ym(method: string, ...args: unknown[]): void {
    if (typeof window.ym === "function") {
      window.ym(counterId, method, ...args);
    }
  }

  return {
    name: "yandex-metrika",

    init() {
      if (!counterId) return;

      /* eslint-disable */
      (function (m: any, e: any, t: any, r: any, i: any, k?: any, a?: any) {
        m[i] =
          m[i] ||
          function () {
            (m[i].a = m[i].a || []).push(arguments);
          };
        m[i].l = 1 * (new Date() as any);
        for (var j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j]!.src === r) return;
        }
        ((k = e.createElement(t)),
          (a = e.getElementsByTagName(t)[0]),
          (k.async = 1),
          (k.src = r),
          a.parentNode.insertBefore(k, a));
      })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
      /* eslint-enable */

      window.ym(counterId, "init", {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
        trackHash: true,
        ecommerce: false,
      });

      log.info("Yandex Metrika initialized", { counterId });
    },

    track(event: string, properties?: EventProperties) {
      if (!consentGranted || !counterId) return;
      ym("reachGoal", event, properties ?? {});
    },

    page(path: string, title?: string) {
      if (!consentGranted || !counterId) return;
      ym("hit", path, { title: title ?? document.title });
    },

    identify(_userId: string, traits?: UserTraits) {
      if (!consentGranted || !counterId) return;
      if (traits) {
        ym("userParams", traits);
      }
    },

    reset() {
      // YM doesn't support user reset — no-op
    },

    setConsent(granted: boolean) {
      consentGranted = granted;
    },
  };
}
