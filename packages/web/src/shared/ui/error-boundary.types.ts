import type { ErrorInfo, ReactNode } from "react";

/** Render-prop fallback receives the caught error and a reset that remounts children below the boundary. */
export type ErrorBoundaryFallbackRender = (api: {
  error: Error;
  resetErrorBoundary: () => void;
}) => ReactNode;

export interface ErrorBoundaryProps {
  fallback?: ReactNode | ErrorBoundaryFallbackRender;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

export interface ErrorBoundaryState {
  error: Error | null;
}
