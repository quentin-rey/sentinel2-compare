import type { ToastItem } from "../hooks/useToasts";

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div id="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.show ? " show" : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
