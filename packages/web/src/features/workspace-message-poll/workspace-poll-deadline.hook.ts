import { useEffect, useState } from "react";

export function usePollDeadline(closesAt?: string | null, deadlineReached?: boolean): boolean {
  const deadline = closesAt ? Date.parse(closesAt) : NaN;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadlineReached !== undefined || !Number.isFinite(deadline)) return;
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (deadline > current)
        timer = window.setTimeout(refresh, Math.min(deadline - current, 2147483647));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [deadline, deadlineReached]);
  return deadlineReached ?? (Number.isFinite(deadline) && deadline <= now);
}
