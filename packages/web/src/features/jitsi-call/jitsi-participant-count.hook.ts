// Этот файл хранит небольшой хук для счётчика участников текущей Jitsi-сессии.
// Он отвечает только за чтение participant count из external API и за сброс значения
// при закрытии звонка. Используется внутри Jitsi-модалки как отдельный session-level слой.

import { useCallback, useEffect, useRef, useState } from "react";

// Это минимальный контракт Jitsi External API, который нужен именно этому хуку.
// Здесь оставлены только методы, без которых нельзя подписаться на изменения участников.
export interface JitsiExternalApi {
  getNumberOfParticipants: () => number;
  on: (event: string, callback: () => void) => void;
}

// Хук держит локальный счётчик участников и не знает ничего о shell-состоянии модалки.
// Его задача — обновлять число участников только пока звонок открыт.
export function useJitsiParticipantCount(open: boolean): {
  participantCount: number | null;
  onApiReady: (api: JitsiExternalApi) => void;
} {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);

  // Берёт актуальное число участников из последнего api instance.
  // Callback стабилен, чтобы повторные shell-ререндеры не пересоздавали подписки.
  const updateCount = useCallback(() => {
    const n = apiRef.current?.getNumberOfParticipants?.();
    if (typeof n === "number") setParticipantCount(n);
  }, []);

  // Вызывается один раз при готовности Jitsi API и регистрирует подписки на join/leave.
  // После этого сам хук умеет поддерживать participantCount без участия оболочки модалки.
  const onApiReady = useCallback(
    (api: JitsiExternalApi) => {
      apiRef.current = api;
      setParticipantCount(api.getNumberOfParticipants());
      api.on("participantJoined", updateCount);
      api.on("participantLeft", updateCount);
    },
    [updateCount],
  );

  useEffect(() => {
    if (open) return;
    // При закрытии звонка обязательно обнуляем api reference и счётчик,
    // чтобы следующее открытие начиналось с чистого session state.
    apiRef.current = null;
    void Promise.resolve().then(() => {
      setParticipantCount(null);
    });
  }, [open]);

  return { participantCount, onApiReady };
}
