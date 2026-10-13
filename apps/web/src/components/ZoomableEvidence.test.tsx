import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ZoomableEvidence } from "./ZoomableEvidence.js";
afterEach(cleanup);
it("bounds zoom and resets it when the reviewer switches evidence", () => {
  const { rerender } = render(<ZoomableEvidence resetKey="one"><img alt="front evidence" /></ZoomableEvidence>);
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.getByText("150% · drag to inspect")).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("region"), { key: "0" });
  expect(screen.getByText("Fit to frame")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  rerender(<ZoomableEvidence resetKey="two"><img alt="rear evidence" /></ZoomableEvidence>);
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
});
it("keeps keyboard panning inside the enlarged evidence bounds", () => {
  render(<ZoomableEvidence resetKey="one"><img alt="front evidence" /></ZoomableEvidence>);
  const canvas = screen.getByRole("region");
  Object.defineProperties(canvas, { clientWidth: { value: 100 }, clientHeight: { value: 80 } });
  fireEvent.keyDown(canvas, { key: "+" });
  fireEvent.keyDown(canvas, { key: "ArrowLeft" });
  fireEvent.keyDown(canvas, { key: "ArrowUp" });
  expect(canvas.firstElementChild).toHaveStyle({ transform: "translate(25px, 20px) scale(1.5)" });
  fireEvent.keyDown(canvas, { key: "0" });
  expect(canvas.firstElementChild).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });
});
