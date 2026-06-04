import React from "react";
import { t } from "~/i18n/i18n";
import { ErrorBoundary } from "~/shared/ui/error-boundary";

export interface SectionErrorFallbackProps {
  onRetry?: () => void;
  /** Optional section label for screen readers (defaults to generic error). */
  label?: string;
}

export function SectionErrorFallback({
  onRetry,
  label,
}: SectionErrorFallbackProps): React.ReactElement {
  return (
    <div
      className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-lg border border-border-subtle bg-card-bg p-4 text-center"
      role="alert"
      aria-label={label ?? t("app.error")}
    >
      <p className="text-sm text-text-muted">{t("app.error")}</p>
      {onRetry != null ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-black"
        >
          {t("app.retry")}
        </button>
      ) : null}
    </div>
  );
}

export interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  /** Passed to SectionErrorFallback aria-label. */
  sectionLabel?: string;
}

/** Isolates widget render failures without crashing the full app shell. */
export function WidgetErrorBoundary({
  children,
  sectionLabel,
}: WidgetErrorBoundaryProps): React.ReactElement {
  return (
    <ErrorBoundary
      fallback={({ resetErrorBoundary }) => (
        <SectionErrorFallback onRetry={resetErrorBoundary} label={sectionLabel} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
