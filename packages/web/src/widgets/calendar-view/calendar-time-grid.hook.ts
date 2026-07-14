import { useEffect, useState } from "react";

const NOW_TICK_MS = 60_000;

/** Re-render on minute boundaries so the now-indicator stays accurate. */
export function useCalendarNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return now;
}
