import type { ErrorInfo, ReactNode } from "react";

export interface ErrorBoundaryProps {
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

export interface ErrorBoundaryState {
  error: Error | null;
}
