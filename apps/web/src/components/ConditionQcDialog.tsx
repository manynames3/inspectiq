import { useEffect, useRef, type ReactNode } from "react";

export function ConditionQcDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog className="condition-qc-dialog" ref={dialog} aria-label="Condition-report QC workspace" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <div className="condition-qc-dialog-toolbar"><strong>Condition-report QC workspace</strong><button type="button" className="secondary-button" onClick={onClose}>Close QC workspace</button></div>
    {children}
  </dialog>;
}
