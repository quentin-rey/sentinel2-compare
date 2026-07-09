import { useCallback, useRef, useState } from "react";

export interface ToastItem {
  id: number;
  message: string;
  show: boolean;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, show: false }]);
    // Two-step show/hide mirrors the original CSS-transition toast: added
    // hidden, flipped to visible next frame, then faded out before removal.
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, show: true } : t)));
    });
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, show: false } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 2500);
  }, []);

  return { toasts, showToast };
}
