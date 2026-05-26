import { useCallback, useEffect, useState } from "react";

export function useMediaViewerZoom(options: { currentIndex: number }): {
  zoom: number;
  onWheel: (e: React.WheelEvent) => void;
  reset: () => void;
} {
  const { currentIndex } = options;
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [currentIndex]);

  const reset = useCallback(() => setZoom(1), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.max(0.5, Math.min(3, z + e.deltaY * -0.001)));
  }, []);

  return { zoom, onWheel, reset };
}
