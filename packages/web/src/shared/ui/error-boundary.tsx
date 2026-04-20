import React from "react";
import { t } from "~/i18n/i18n";
import { createLogger } from "~/shared/lib/logger";
import { captureException } from "~/shared/lib/sentry";
import type {
  ErrorBoundaryFallbackRender,
  ErrorBoundaryProps,
  ErrorBoundaryState,
} from "./error-boundary.types";

const log = createLogger("error-boundary");

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  resetErrorBoundary = (): void => {
    this.setState({ error: null });
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error("Uncaught error", {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    });
    captureException(error, {
      componentStack: info.componentStack?.slice(0, 1000),
    });
    this.props.onError?.(error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (fallback != null) {
        if (typeof fallback === "function") {
          return fallback({
            error: this.state.error,
            resetErrorBoundary: this.resetErrorBoundary,
          });
        }
        return fallback;
      }

      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-medium text-text-primary">{t("app.error")}</p>
          <p className="max-w-md text-sm text-text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.resetErrorBoundary}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            {t("app.retry")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface PageErrorFallbackProps {
  /** Clears the error boundary and remounts children so effects and requests run again. */
  onRetry?: () => void;
}

export function PageErrorFallback({ onRetry }: PageErrorFallbackProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg font-medium text-text-primary">{t("app.pageLoadError")}</p>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        {onRetry != null ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            {t("app.retry")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={
            onRetry != null
              ? "rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary"
              : "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          }
        >
          {t("app.reload")}
        </button>
      </div>
    </div>
  );
}

export function PageLoader(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
    </div>
  );
}
