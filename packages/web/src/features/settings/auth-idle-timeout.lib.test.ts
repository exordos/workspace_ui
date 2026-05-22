/**
 * Тесты для доменного модуля auth-idle-timeout.
 *
 * Проверяют корректность:
 * - конвертации пресетов в миллисекунды;
 * - обработки специального пресета `never`;
 * - runtime-валидации входных значений;
 * - fallback-логики при невалидных данных.
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_IDLE_TIMEOUT_PRESETS,
  authIdleTimeoutToMs,
  isAuthIdleTimeout,
  resolveAuthIdleTimeout,
} from "./auth-idle-timeout.lib";

/** Набор unit-тестов на единый источник истины для idle timeout пресетов. */
describe("auth idle timeout lib", () => {
  /** Каждый поддерживаемый пресет должен иметь предсказуемое значение в миллисекундах. */
  it("converts each preset to expected milliseconds", () => {
    expect(authIdleTimeoutToMs("6h")).toBe(6 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("12h")).toBe(12 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("3d")).toBe(3 * 24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  /** Специальный пресет `never` обязан отключать guard через null. */
  it("returns null for never preset", () => {
    expect(authIdleTimeoutToMs("never")).toBeNull();
  });

  /** Публичный список пресетов должен совпадать с поддерживаемым доменным набором. */
  it("contains all supported presets", () => {
    expect(AUTH_IDLE_TIMEOUT_PRESETS).toEqual(["6h", "12h", "24h", "3d", "7d", "never"]);
  });

  /** Type guard должен принимать только допустимые строковые значения пресета. */
  it("accepts only valid auth idle timeout values", () => {
    expect(isAuthIdleTimeout("6h")).toBe(true);
    expect(isAuthIdleTimeout("never")).toBe(true);
    expect(isAuthIdleTimeout("5h")).toBe(false);
    expect(isAuthIdleTimeout("")).toBe(false);
    expect(isAuthIdleTimeout(null)).toBe(false);
    expect(isAuthIdleTimeout(undefined)).toBe(false);
    expect(isAuthIdleTimeout(24)).toBe(false);
    expect(isAuthIdleTimeout({})).toBe(false);
  });

  /** Resolver должен возвращать fallback, если входное значение невалидно. */
  it("falls back when provided value is invalid", () => {
    expect(resolveAuthIdleTimeout("24h", "3d")).toBe("24h");
    expect(resolveAuthIdleTimeout("bad", "3d")).toBe("3d");
    expect(resolveAuthIdleTimeout(undefined, "never")).toBe("never");
  });
});
