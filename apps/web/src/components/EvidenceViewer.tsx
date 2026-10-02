import { useEffect, useRef, type ReactNode } from "react";
import type { VehiclePhoto } from "../types.js";

export function EvidenceViewer({ photos, selectedId, onSelect, onClose, renderPhoto }: {
  photos: VehiclePhoto[]; selectedId: string; onSelect: (id: string) => void; onClose: () => void;
  renderPhoto: (photo: VehiclePhoto) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const index = photos.findIndex((p) => p.id === selectedId);
  const photo = photos[index];
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  if (!photo) return null;
  const move = (step: number) => onSelect(photos[(index + step + photos.length) % photos.length].id);
  return <dialog ref={dialog} className="condition-evidence-viewer" aria-label="Enlarged evidence photo" onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
  }}>
    <div className="condition-qc-actions"><strong>{photo.originalFilename} · {index + 1}/{photos.length}</strong><button className="secondary-button" onClick={onClose}>Close photo</button></div>
    {renderPhoto(photo)}
    <div className="condition-qc-actions"><button className="secondary-button" onClick={() => move(-1)} disabled={photos.length < 2}>Previous photo</button><button className="secondary-button" onClick={() => move(1)} disabled={photos.length < 2}>Next photo</button></div>
  </dialog>;
}
