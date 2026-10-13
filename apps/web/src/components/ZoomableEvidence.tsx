import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, Scan } from "lucide-react";

export function ZoomableEvidence({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); dragging.current = null; }, [resetKey]);
  const changeZoom = (value: number) => { setZoom(Math.max(1, Math.min(4, value))); setPan({ x: 0, y: 0 }); dragging.current = null; };
  return <div className="evidence-zoom">
    <div className="evidence-zoom-toolbar"><span>{zoom === 1 ? "Fit to frame" : `${Math.round(zoom * 100)}% · drag to inspect`}</span><div>
      <button className="icon-button" aria-label="Zoom out" disabled={zoom === 1} onClick={() => changeZoom(zoom - .5)}><Minus size={16} /></button>
      <button className="icon-button" aria-label="Fit photo to frame" onClick={() => changeZoom(1)}><Scan size={16} /></button>
      <button className="icon-button" aria-label="Zoom in" disabled={zoom === 4} onClick={() => changeZoom(zoom + .5)}><Plus size={16} /></button>
    </div></div>
    <div className={`evidence-canvas ${zoom > 1 ? "zoomed" : ""}`} tabIndex={0} role="region" aria-label="Evidence photo; plus and minus to zoom, zero to fit, drag to pan" onKeyDown={(event) => {
      if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(zoom + .5); }
      if (event.key === "-") { event.preventDefault(); changeZoom(zoom - .5); }
      if (event.key === "0") { event.preventDefault(); changeZoom(1); }
      if (zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const width = event.currentTarget.clientWidth * (zoom - 1) / 2;
        const height = event.currentTarget.clientHeight * (zoom - 1) / 2;
        setPan((old) => ({ x: Math.max(-width, Math.min(width, old.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0))), y: Math.max(-height, Math.min(height, old.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0))) }));
      }
    }} onDragStart={(event) => event.preventDefault()} onPointerDown={(event) => {
      if (zoom === 1) return;
      dragging.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const start = dragging.current; if (!start || zoom === 1) return;
      const width = event.currentTarget.clientWidth * (zoom - 1) / 2;
      const height = event.currentTarget.clientHeight * (zoom - 1) / 2;
      setPan({ x: Math.max(-width, Math.min(width, start.panX + event.clientX - start.x)), y: Math.max(-height, Math.min(height, start.panY + event.clientY - start.y)) });
    }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <div className="evidence-image-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>{children}</div>
    </div>
  </div>;
}
