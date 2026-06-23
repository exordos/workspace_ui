import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { requestReconnect } from "~/shared/lib/connection-health";
import {
  resolveLayoutConnectionBannerMessage,
  resolveLayoutConnectionBannerSeverity,
} from "./layout-connection-banner.lib";
import { LayoutTopBanner } from "./layout-top-banner.ui";
import type { LayoutConnectionBannerProps } from "./layout-connection-banner.types";
import type { LayoutTopBannerItem } from "./layout-top-banner.types";

export const LayoutConnectionBanner = React.memo<LayoutConnectionBannerProps>(
  function LayoutConnectionBanner({ online, health, rateLimitSeconds }) {
    const message = useMemo(
      () => resolveLayoutConnectionBannerMessage(online, health, rateLimitSeconds),
      [online, health, rateLimitSeconds],
    );
    const severity = useMemo(
      () => resolveLayoutConnectionBannerSeverity(online, health),
      [online, health],
    );
    const [persistentExpanded, setPersistentExpanded] = useState(message != null);
    const [previewExpanded, setPreviewExpanded] = useState(false);
    const previousMessageRef = useRef<string | null>(message);
    const collapsedTriggerRef = useRef<HTMLButtonElement | null>(null);
    const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
    const primaryActionRef = useRef<HTMLButtonElement | null>(null);
    const focusTargetRef = useRef<"collapsed" | "primary" | null>(null);
    const suppressNextCollapsedFocusRef = useRef(false);

    useEffect(() => {
      const previousMessage = previousMessageRef.current;
      if (previousMessage == null && message != null) {
        setPersistentExpanded(true);
        setPreviewExpanded(false);
      }
      if (message == null) {
        setPersistentExpanded(false);
        setPreviewExpanded(false);
        focusTargetRef.current = null;
      }
      previousMessageRef.current = message;
    }, [message]);

    const expanded = persistentExpanded || previewExpanded;

    useEffect(() => {
      const focusTarget = focusTargetRef.current;
      if (focusTarget == null) {
        return;
      }
      if (focusTarget === "collapsed") {
        suppressNextCollapsedFocusRef.current = true;
        collapsedTriggerRef.current?.focus();
      } else {
        (primaryActionRef.current ?? collapseButtonRef.current)?.focus();
      }
      focusTargetRef.current = null;
    }, [expanded, message]);

    const handleRetry = useCallback(() => {
      requestReconnect();
    }, []);

    const expand = useCallback(
      (focusTarget?: "primary") => {
        if (message == null) {
          return;
        }
        if (focusTarget != null) {
          focusTargetRef.current = focusTarget;
        }
        if (!persistentExpanded) {
          setPreviewExpanded(true);
        }
      },
      [message, persistentExpanded],
    );

    const collapse = useCallback((restoreCollapsedFocus = false) => {
      if (restoreCollapsedFocus) {
        focusTargetRef.current = "collapsed";
      }
      setPersistentExpanded(false);
      setPreviewExpanded(false);
    }, []);

    const collapsePreview = useCallback(
      (restoreCollapsedFocus = false) => {
        if (!previewExpanded || persistentExpanded) {
          return;
        }
        if (restoreCollapsedFocus) {
          focusTargetRef.current = "collapsed";
        }
        setPreviewExpanded(false);
      },
      [persistentExpanded, previewExpanded],
    );

    const togglePersistentExpanded = useCallback(() => {
      if (persistentExpanded) {
        collapse(true);
        return;
      }
      setPersistentExpanded(true);
      setPreviewExpanded(false);
    }, [collapse, persistentExpanded]);

    const handleExpandedCollapse = useCallback(() => {
      if (persistentExpanded) {
        collapse(true);
        return;
      }
      collapsePreview(true);
    }, [collapse, collapsePreview, persistentExpanded]);

    const handleCollapsedFocus = useCallback(() => {
      if (suppressNextCollapsedFocusRef.current) {
        suppressNextCollapsedFocusRef.current = false;
        return;
      }
      expand("primary");
    }, [expand]);

    const item = useMemo<LayoutTopBannerItem | null>(() => {
      if (message == null) {
        return null;
      }
      return {
        id: "connection",
        message,
        severity,
        canCollapse: true,
        canDismiss: false,
        primaryActionLabel: t("app.retryConnection"),
        onPrimaryAction: handleRetry,
      };
    }, [handleRetry, message, severity]);

    if (item == null) {
      return null;
    }

    return (
      <LayoutTopBanner
        item={item}
        expanded={expanded}
        persistentExpanded={persistentExpanded}
        onExpand={() => {
          expand();
        }}
        onCollapsedFocus={handleCollapsedFocus}
        onCollapse={handleExpandedCollapse}
        onTogglePersistentExpanded={togglePersistentExpanded}
        onPreviewLeave={() => {
          collapsePreview();
        }}
        collapsedTriggerRef={collapsedTriggerRef}
        collapseButtonRef={collapseButtonRef}
        primaryActionRef={primaryActionRef}
      />
    );
  },
);
