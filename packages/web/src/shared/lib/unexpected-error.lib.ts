/**
 * Reports unexpected async failures to structured logs and Sentry.
 *
 * Use for `.catch()` handlers where the error is not an expected abort/offline path.
 */
import { createLogger } from "~/shared/lib/logger";
import { captureException } from "~/shared/lib/sentry";

export function reportUnexpectedError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const log = createLogger(scope);
  const message = err instanceof Error ? err.message : String(err);
  log.error("Unexpected error", { message, ...context });
  if (err instanceof Error) {
    captureException(err, { scope, ...context });
  } else {
    captureException(new Error(message), { scope, originalError: err, ...context });
  }
}
