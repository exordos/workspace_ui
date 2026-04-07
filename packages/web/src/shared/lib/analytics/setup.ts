/**
 * Analytics bootstrap — registers configured providers and initializes.
 *
 * Called once in main.tsx. Reads env vars to decide which providers to activate.
 * If no measurement IDs are configured, analytics is a no-op.
 */

import { createGA4Provider } from "./ga4";
import { createYMProvider } from "./ym";
import { analytics } from "./analytics";

export function initAnalytics(): void {
  const ga4Id = import.meta.env.VITE_GA4_MEASUREMENT_ID ?? "";
  const ymId = import.meta.env.VITE_YM_COUNTER_ID ?? "";

  if (ga4Id) {
    analytics.registerProvider(createGA4Provider(ga4Id));
  }

  if (ymId) {
    const numericId = Number(ymId);
    if (!Number.isNaN(numericId) && numericId > 0) {
      analytics.registerProvider(createYMProvider(numericId));
    }
  }

  analytics.init();
}
