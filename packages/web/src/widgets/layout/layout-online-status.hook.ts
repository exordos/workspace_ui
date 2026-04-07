import { useEffect, useState } from "react";
import { isOnline, onStatusChange } from "~/shared/lib/network";

export function useLayoutOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline());

  useEffect(() => onStatusChange(setOnline), []);

  return online;
}

