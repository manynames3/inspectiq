import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill, statusLabel } from "./StatusPill.js";

describe("StatusPill", () => {
  it("renders readable status labels", () => {
    expect(statusLabel("HUMAN_REVIEW_REQUIRED")).toBe("Human review");
    render(<StatusPill status="READY_FOR_GRADING" />);
    expect(screen.getByText("Ready for grading")).toBeInTheDocument();
  });
});

