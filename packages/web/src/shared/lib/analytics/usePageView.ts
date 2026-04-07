/**
 * React hook for automatic page view tracking.
 *
 * Tracks route changes via react-router location.
 * Call once in the root App component.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { analytics } from "./analytics";

export function usePageView(): void {
  const location = useLocation();
  const prevPath = useRef<string>("");

  useEffect(() => {
    const path = location.pathname + location.search;
    if (path === prevPath.current) return;
    prevPath.current = path;

    analytics.page(path, document.title);
  }, [location.pathname, location.search]);
}
