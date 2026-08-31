import type { TopicSummaryEndpointValidationError } from "./topic-summary-endpoints.types";
import type {
  TopicSummaryOperationError,
  TopicSummaryValidationError,
} from "./topic-summary-settings.types";

export const INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-text-field-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60";
export const SECTION_CLASS = "flex h-full min-h-0 flex-col";
export const SECTION_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto px-8 pb-5 pt-5";
export const SECTION_FOOTER_CLASS =
  "flex h-20 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-bg-elevated px-8 py-4";
export const ERROR_NOTICE_CLASS =
  "rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger";

export function operationErrorText(
  error: TopicSummaryOperationError | null,
  translate: (key: string, vars?: Record<string, unknown>) => string,
): string | null {
  return error == null ? null : translate(`topicSummarySettings.status.${error}`);
}

export function validationErrorText(
  error: TopicSummaryValidationError | null,
  translate: (key: string, vars?: Record<string, unknown>) => string,
): string | null {
  if (error === "custom_prompt_empty") return translate("topicSummarySettings.status.promptEmpty");
  if (error === "custom_prompt_too_long") {
    return translate("topicSummarySettings.status.promptTooLong");
  }
  return null;
}

export function endpointValidationErrorText(
  error: TopicSummaryEndpointValidationError | undefined,
  translate: (key: string, vars?: Record<string, unknown>) => string,
): string | undefined {
  if (error == null) return undefined;
  const keyByError: Record<TopicSummaryEndpointValidationError, string> = {
    required: "required",
    invalid: "invalidValue",
    too_long: "tooLong",
    out_of_range: "outOfRange",
    integer_required: "integerRequired",
  };
  return translate(`topicSummarySettings.status.${keyByError[error]}`);
}
