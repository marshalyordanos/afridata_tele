import { useEffect } from "react";
import { CloseIcon } from "./Icons";

export type ToastMessage = { kind: "success" | "error"; text: string } | null;

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      <span>{toast.text}</span>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss">
        <CloseIcon className="icon" />
      </button>
    </div>
  );
}
