import { useEffect, useRef, type ReactNode } from "react";

export function ConditionQcDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog className="condition-qc-dialog" ref={dialog} aria-label="Condition-report QC workspace" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <div className="condition-qc-dialog-toolbar"><strong>Condition-report QC workspace</strong><button type="button" className="secondary-button" onClick={onClose}>Close QC workspace</button></div>
    <div className="condition-qc-dialog-content">{children}</div>
  </dialog>;
}
