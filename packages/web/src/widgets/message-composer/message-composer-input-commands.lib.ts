// message-composer-input-commands.lib.ts
// Назначение:
// - Единая точка правил для команд "отправить" и "перенос строки" в composer.
// Что хранит:
// - Режимы поведения Enter (`enter-sends` / `mod-enter-sends`).
// - Предикаты `isSendCommand` и `isNewlineCommand`.
// Важно:
// - UI не должен дублировать эти условия в `onKeyDown`; изменения правил делаются только здесь.
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// Режимы поведения Enter в composer.
export type ComposerSendNewlineMode = "enter-sends" | "mod-enter-sends";

type KeyboardCommandEvent = Pick<
  ReactKeyboardEvent<HTMLTextAreaElement>,
  "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
>;

function isPlainEnter(event: KeyboardCommandEvent): boolean {
  // Чистый Enter без модификаторов.
  return (
    event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  );
}

function isShiftEnter(event: KeyboardCommandEvent): boolean {
  // Shift+Enter — явная команда "перенос строки".
  return (
    event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
  );
}

function isModEnter(event: KeyboardCommandEvent): boolean {
  // Cmd/Ctrl+Enter — альтернативная команда отправки.
  return (
    event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
  );
}

export function isSendCommand(event: KeyboardCommandEvent, mode: ComposerSendNewlineMode): boolean {
  // В режиме mod-enter-sends отправка уезжает на Cmd/Ctrl+Enter.
  if (mode === "mod-enter-sends") {
    return isModEnter(event);
  }
  // Текущий дефолт: обычный Enter отправляет сообщение.
  return isPlainEnter(event);
}

export function isNewlineCommand(
  event: KeyboardCommandEvent,
  mode: ComposerSendNewlineMode,
): boolean {
  // В mod-enter-sends обычный Enter (и Shift+Enter) должны давать перенос.
  if (mode === "mod-enter-sends") {
    return isPlainEnter(event) || isShiftEnter(event);
  }
  // Текущий дефолт: перенос только по Shift+Enter.
  return isShiftEnter(event);
}
