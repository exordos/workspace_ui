import React from "react";
import { t } from "~/i18n/i18n";
import { createLogger } from "~/shared/lib/logger";
import { captureException } from "~/shared/lib/sentry";
import type { ErrorBoundaryProps, ErrorBoundaryState } from "./error-boundary.types";

const log = createLogger("error-boundary");

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

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
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-medium text-text-primary">{t("app.error")}</p>
          <p className="max-w-md text-sm text-text-muted">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
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

export function PageErrorFallback(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg font-medium text-text-primary">{t("app.pageLoadError")}</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
      >
        {t("app.reload")}
      </button>
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
