import { useEffect, useRef } from "react";

export default function Dialog({ title, children, onClose, closeLabel, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const first = dialog.querySelector("[data-autofocus]");
    first?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`cv-dialog ${wide ? "cv-dialog-wide" : ""}`} aria-labelledby="cv-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><div className="cv-dialog-heading"><h2 id="cv-dialog-title">{title}</h2><button type="button" className="cv-icon-button" aria-label={closeLabel} onClick={onClose}>×</button></div>{children}</dialog>;
}
