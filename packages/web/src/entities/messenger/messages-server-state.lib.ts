import type { MessengerMessage } from "./messenger.types";

// Применение состояния отделяет серверное подтверждение от проекций тела.
export interface AppliedServerMessages {
  status: "applied";
  evidence: readonly MessengerMessage[]; // Пакет наблюдённых сообщений для исходящих.
  project?: () => void; // Синхронная публикация указателей источника.
  persist?: () => void; // Необязательная запись кеша после публикации результата.
}
