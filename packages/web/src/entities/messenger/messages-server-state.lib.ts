import type { MessengerMessage } from "./messenger.types";

// Применение состояния отделяет серверное подтверждение от проекций тела.
export interface AppliedServerMessages {
  status: "applied";
  evidence: readonly MessengerMessage[]; // Пакет наблюдённых сообщений для исходящих.
  project?: () => void; // Синхронная публикация указателей источника.
  persist?: () => void; // Необязательная запись кеша после публикации результата.
}

// Date.parse compares instants but drops the backend's sub-millisecond precision.
export function isLaterMessageTimestamp(current: string, incoming: string): boolean {
  if (current === incoming) return false;
  const currentTime = Date.parse(current);
  const incomingTime = Date.parse(incoming);
  if (currentTime !== incomingTime) return currentTime > incomingTime;
  const fraction = (timestamp: string) => Number(`0.${/\.(\d+)/.exec(timestamp)?.[1] ?? "0"}`);
  return fraction(current) > fraction(incoming);
}
