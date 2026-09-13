import { useEffect } from "react";
import { CloseIcon } from "./Icons";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "regular" | "small";
};

export function Modal({ title, description, onClose, children, size = "regular" }: ModalProps) {
  // Escape closes the dialog, and the page behind it should not scroll.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="scrim" aria-label="Close dialog" onClick={onClose} />
      <div className={`modal modal--${size}`}>
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <CloseIcon className="icon" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
