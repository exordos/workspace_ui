/**
 * Partial Vitest mock for `~/shared/lib/logger`.
 * Keeps redact, logAction, appendBufferedLog, etc.; silences console-oriented helpers.
 */
import { vi } from "vitest";

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => silentLogger(),
  };
}

export async function createPartialLoggerMock<T extends Record<string, unknown>>(
  importOriginal: () => Promise<T>,
  overrides: Record<string, unknown> = {},
): Promise<T & Record<string, unknown>> {
  const actual = await importOriginal();
  return {
    ...actual,
    createLogger: silentLogger,
    logApiCall: vi.fn(),
    logStoreAction: vi.fn(),
    logEvent: vi.fn(),
    ...overrides,
  };
}
