/**
 * Unified HTTP error responses for mail-proxy route handlers.
 */

import type { Response } from "express";
import { mailLog } from "../logger.lib";

export interface RouteErrorOptions {
  /** Map auth-related error messages to 401 instead of 400. */
  detectAuthErrors?: boolean;
}

export function handleRouteError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  options: RouteErrorOptions = {},
): void {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const cause =
    error instanceof Error && error.cause != null ? String(error.cause) : undefined;
  mailLog.warn(fallbackMessage, { error: message, ...(cause != null ? { cause } : {}) });

  let status = 400;
  if (options.detectAuthErrors) {
    if (message.includes("(401)") || message.includes("authentication failed")) {
      status = 401;
    }
  }

  res.status(status).json({ error: message });
}
