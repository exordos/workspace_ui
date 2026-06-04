import { useEffect } from "react";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import {
  isInteractiveElementFocused,
  isModalShortcutContextOpen,
  resolveLayoutEscapeKeyDown,
} from "./layout-escape-navigation.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutEscapeNavigation(options: {
  enabled: boolean;
  pathname: string;
  navigate: NavigateFunction;
}): void {
  const { enabled, pathname, navigate } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveLayoutEscapeKeyDown({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        pathname,
        interactiveElementFocused: isInteractiveElementFocused(),
        modalOpen: isModalShortcutContextOpen(),
      });
      if (action !== "navigate-inbox") return;

      event.preventDefault();
      void navigate(withCurrentOrgRoute("/inbox"));
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, navigate, pathname]);
}
