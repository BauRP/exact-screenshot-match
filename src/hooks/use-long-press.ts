import { useCallback, useRef } from "react";

type Options = {
  delay?: number;
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  onClick?: (e: React.TouchEvent | React.MouseEvent) => void;
};

export function useLongPress({ delay = 500, onLongPress, onClick }: Options) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      triggered.current = false;
      const pt =
        "touches" in e
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      startPos.current = pt;
      timer.current = setTimeout(() => {
        triggered.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const move = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!startPos.current) return;
    const pt =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
    const dx = pt.x - startPos.current.x;
    const dy = pt.y - startPos.current.y;
    if (dx * dx + dy * dy > 100) clear();
  }, []);

  const end = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      clear();
      if (!triggered.current && onClick) onClick(e);
    },
    [onClick],
  );

  const cancel = useCallback(() => {
    clear();
  }, []);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: cancel,
  };
}
