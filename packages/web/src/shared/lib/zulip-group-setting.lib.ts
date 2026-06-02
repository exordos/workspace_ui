// Утилиты нормализации/сравнения group-setting значений Zulip.
// Нужны, чтобы API-слой и store работали с единым форматом прав канала
// (`number | { direct_members, direct_subgroups }`) и не дублировали парсинг.
import type {
  ZulipGroupSettingValue,
  ZulipGroupSettingValueObject,
} from "~/shared/api/zulip.types";

// Проверяет, что значение — положительный integer идентификатор пользователя/группы.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Нормализует массив id: фильтрует невалидные значения, удаляет дубли, сортирует.
function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter(isPositiveInteger))).sort((left, right) => left - right);
}

// Нормализует объектную форму group-setting значения Zulip.
// Если структура невалидна, возвращает undefined.
function normalizeGroupSettingObject(value: unknown): ZulipGroupSettingValueObject | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    direct_members: normalizeIds(record.direct_members),
    direct_subgroups: normalizeIds(record.direct_subgroups),
  };
}

// Приводит raw значение group-setting из API к стабильному доменному формату.
// Поддерживает обе формы Zulip: `group_id` (число) и `{ direct_members, direct_subgroups }`.
export function normalizeGroupSettingValue(value: unknown): ZulipGroupSettingValue | undefined {
  const normalized: ZulipGroupSettingValue | undefined = isPositiveInteger(value)
    ? value
    : normalizeGroupSettingObject(value);
  return normalized;
}

// Сравнивает два group-setting значения с учетом формы и содержимого массивов.
// Используется для точного detection изменений metadata в store.
export function areGroupSettingValuesEqual(
  left: ZulipGroupSettingValue | undefined,
  right: ZulipGroupSettingValue | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left === "number" || typeof right === "number") {
    return left === right;
  }
  if (left.direct_members.length !== right.direct_members.length) return false;
  if (left.direct_subgroups.length !== right.direct_subgroups.length) return false;
  for (let index = 0; index < left.direct_members.length; index += 1) {
    if (left.direct_members[index] !== right.direct_members[index]) {
      return false;
    }
  }
  for (let index = 0; index < left.direct_subgroups.length; index += 1) {
    if (left.direct_subgroups[index] !== right.direct_subgroups[index]) {
      return false;
    }
  }
  return true;
}
