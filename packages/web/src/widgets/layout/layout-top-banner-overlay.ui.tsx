import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutTopBanner } from "./layout-top-banner.ui";
import type { LayoutTopBannerItem } from "./layout-top-banner.types";

type FocusTarget = "collapsed" | "primary" | "secondary" | "collapse";

interface LayoutTopBannerOverlayProps {
  item: LayoutTopBannerItem | null;
}

export const LayoutTopBannerOverlay = React.memo<LayoutTopBannerOverlayProps>(
  function LayoutTopBannerOverlay({ item }) {
    const [persistentExpanded, setPersistentExpanded] = useState(item != null);
    const previousItemIdRef = useRef<string | null>(item?.id ?? null);
    const collapsedTriggerRef = useRef<HTMLButtonElement | null>(null);
    const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
    const primaryActionRef = useRef<HTMLButtonElement | null>(null);
    const secondaryActionRef = useRef<HTMLButtonElement | null>(null);
    const focusTargetRef = useRef<FocusTarget | null>(null);

    useEffect(() => {
      const previousItemId = previousItemIdRef.current;
      const nextItemId = item?.id ?? null;
      if (previousItemId == null && nextItemId != null) {
        setPersistentExpanded(true);
      }
      if (nextItemId == null) {
        setPersistentExpanded(false);
        focusTargetRef.current = null;
      }
      previousItemIdRef.current = nextItemId;
    }, [item]);

    const expanded = persistentExpanded;

    useEffect(() => {
      const focusTarget = focusTargetRef.current;
      if (focusTarget == null) {
        return;
      }
      if (focusTarget === "collapsed") {
        collapsedTriggerRef.current?.focus();
        focusTargetRef.current = null;
        return;
      }

      const primaryFocusTarget =
        primaryActionRef.current ?? secondaryActionRef.current ?? collapseButtonRef.current;
      const secondaryFocusTarget =
        secondaryActionRef.current ?? primaryActionRef.current ?? collapseButtonRef.current;
      const collapseFocusTarget =
        collapseButtonRef.current ?? primaryActionRef.current ?? secondaryActionRef.current;

      if (focusTarget === "primary") {
        primaryFocusTarget?.focus();
      } else if (focusTarget === "secondary") {
        secondaryFocusTarget?.focus();
      } else {
        collapseFocusTarget?.focus();
      }
      focusTargetRef.current = null;
    }, [expanded, item]);

    const expand = useCallback(
      (focusTarget?: Exclude<FocusTarget, "collapsed">) => {
        if (item == null) {
          return;
        }
        if (focusTarget != null) {
          focusTargetRef.current = focusTarget;
        }
        setPersistentExpanded(true);
      },
      [item],
    );

    const collapse = useCallback((restoreCollapsedFocus = false) => {
      if (restoreCollapsedFocus) {
        focusTargetRef.current = "collapsed";
      }
      setPersistentExpanded(false);
    }, []);

    if (item == null) {
      return null;
    }

    return (
      <LayoutTopBanner
        item={item}
        expanded={expanded}
        onExpand={() => {
          expand();
        }}
        onCollapse={() => {
          collapse(true);
        }}
        collapsedTriggerRef={collapsedTriggerRef}
        collapseButtonRef={collapseButtonRef}
        primaryActionRef={primaryActionRef}
        secondaryActionRef={secondaryActionRef}
      />
    );
  },
);
