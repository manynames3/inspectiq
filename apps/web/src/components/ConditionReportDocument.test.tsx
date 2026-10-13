import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ConditionReportDocument } from "./ConditionReportDocument.js";
import type { InspectionBundle } from "../types.js";
it("does not present unsaved report language as human-approved", () => {
  const bundle = { inspection: { year: 2022, make: "Ford", model: "Escape", vin: "TEST", mileage: 1000 }, finalReport: { reportBody: "Reviewed text", version: 3, approvalStatus: "approved", approvedBy: "Reviewer One", approvedAt: "2026-10-12T12:00:00Z", finalizedAt: null } } as InspectionBundle;
  const { rerender } = render(<ConditionReportDocument bundle={bundle} body="Reviewed text" />);
  expect(screen.getByText("Approved · awaiting release")).toBeInTheDocument();
  rerender(<ConditionReportDocument bundle={bundle} body="New, unreviewed disclosure" />);
  expect(screen.getByText("Unsaved draft · not reviewed")).toBeInTheDocument();
  expect(screen.queryByText("Reviewer One")).not.toBeInTheDocument();
  expect(screen.getByText("Not reviewed")).toBeInTheDocument();
});
