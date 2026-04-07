import React from "react";
import { LayoutFullscreenError, LayoutFullscreenLoading } from "./layout-loading-state.ui";

interface LayoutLoadingGateProps {
  showFullscreenLoader: boolean;
  showError: boolean;
  children: React.ReactNode;
}

export const LayoutLoadingGate = React.memo<LayoutLoadingGateProps>(function LayoutLoadingGate({
  showFullscreenLoader,
  showError,
  children,
}) {
  if (showFullscreenLoader) {
    return <LayoutFullscreenLoading />;
  }
  if (showError) {
    return <LayoutFullscreenError />;
  }
  return <>{children}</>;
});
