import React from "react";
import { LayoutConnectionBlocked, LayoutFullscreenLoading } from "./layout-loading-state.ui";

interface LayoutLoadingGateProps {
  showFullscreenLoader: boolean;
  showConnectionBlocked: boolean;
  children: React.ReactNode;
}

export const LayoutLoadingGate = React.memo<LayoutLoadingGateProps>(function LayoutLoadingGate({
  showFullscreenLoader,
  showConnectionBlocked,
  children,
}) {
  if (showFullscreenLoader) {
    return <LayoutFullscreenLoading />;
  }
  if (showConnectionBlocked) {
    return <LayoutConnectionBlocked />;
  }
  return <>{children}</>;
});
