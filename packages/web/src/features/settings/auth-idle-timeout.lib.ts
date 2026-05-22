/**
 * Единый доменный модуль для пресетов таймаута неактивности авторизации.
 *
 * Отвечает за:
 * - канонический список пресетов для UI и бизнес-логики;
 * - конвертацию пресета в миллисекунды для auth guard;
 * - runtime-проверку значения из внешних источников (например, localStorage);
 * - безопасное резолвинг-значение с fallback.
 */
import type { AuthIdleTimeout } from "./settings.types";

/** Количество миллисекунд в одном часе. */
const HOUR_IN_MS = 60 * 60 * 1000;
/** Количество миллисекунд в одних сутках. */
const DAY_IN_MS = 24 * HOUR_IN_MS;

/** Единый источник истины: соответствие пресета и таймаута в миллисекундах. */
const AUTH_IDLE_TIMEOUT_MS_BY_PRESET: Record<AuthIdleTimeout, number | null> = {
  "6h": 6 * HOUR_IN_MS,
  "12h": 12 * HOUR_IN_MS,
  "24h": 24 * HOUR_IN_MS,
  "3d": 3 * DAY_IN_MS,
  "7d": 7 * DAY_IN_MS,
  never: null,
};

/** Публичный список доступных пресетов для рендера в UI и циклического выбора. */
export const AUTH_IDLE_TIMEOUT_PRESETS: readonly AuthIdleTimeout[] = [
  "6h",
  "12h",
  "24h",
  "3d",
  "7d",
  "never",
];

/** Возвращает длительность пресета в миллисекундах; для `never` возвращает `null`. */
export function authIdleTimeoutToMs(timeout: AuthIdleTimeout): number | null {
  return AUTH_IDLE_TIMEOUT_MS_BY_PRESET[timeout];
}

/** Проверяет, что значение является валидным пресетом таймаута неактивности. */
export function isAuthIdleTimeout(value: unknown): value is AuthIdleTimeout {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(AUTH_IDLE_TIMEOUT_MS_BY_PRESET, value)
  );
}

/** Возвращает валидный пресет или fallback, если значение некорректно. */
export function resolveAuthIdleTimeout(value: unknown, fallback: AuthIdleTimeout): AuthIdleTimeout {
  return isAuthIdleTimeout(value) ? value : fallback;
}
