import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ConditionReportDocument } from "./ConditionReportDocument.js";
import type { InspectionBundle } from "../types.js";
afterEach(cleanup);
it("does not present unsaved report language as human-approved", () => {
  const bundle = { inspection: { year: 2022, make: "Ford", model: "Escape", vin: "TEST", mileage: 1000 }, finalReport: { reportBody: "Reviewed text", version: 3, approvalStatus: "approved", approvedBy: "Reviewer One", approvedAt: "2026-10-12T12:00:00Z", finalizedAt: null } } as InspectionBundle;
  const { rerender } = render(<ConditionReportDocument bundle={bundle} body="Reviewed text" />);
  expect(screen.getByText("Approved · awaiting release")).toBeInTheDocument();
  rerender(<ConditionReportDocument bundle={bundle} body="New, unreviewed disclosure" />);
  expect(screen.getByText("Unsaved draft · not reviewed")).toBeInTheDocument();
  expect(screen.queryByText("Reviewer One")).not.toBeInTheDocument();
  expect(screen.getByText("Not reviewed")).toBeInTheDocument();
});

it("labels legacy finalized paper as historical without changing its body or release record", () => {
  const bundle = { requiresReinspection: true, inspection: { year: 2022, make: "Ford", model: "Escape", vin: "TEST", mileage: 1000 }, finalReport: { reportBody: "Original historical disclosure", version: 4, approvalStatus: "finalized", approvedBy: "Original Reviewer", approvedAt: "2026-07-24T12:04:00Z", finalizedAt: "2026-07-24T12:05:00Z" } } as InspectionBundle;
  const original = JSON.stringify(bundle);
  render(<ConditionReportDocument bundle={bundle} />);
  const state = screen.getByText("Historical release · current-policy reinspection required");
  expect(state).not.toHaveClass("released");
  expect(screen.queryByText("Finalized")).not.toBeInTheDocument();
  expect(screen.getByText(/not certified under the current evidence-QC policy/)).toBeInTheDocument();
  expect(screen.getByText("Original historical disclosure")).toBeInTheDocument();
  expect(screen.getByText("Original Reviewer")).toBeInTheDocument();
  expect(screen.getByText("v4 · historical publication")).toBeInTheDocument();
  expect(JSON.stringify(bundle)).toBe(original);
});

it("does not infer current-QC approval when a finalized record omits the policy flag", () => {
  const bundle = { inspection: { year: 2022, make: "Ford", model: "Escape", vin: "TEST", mileage: 1000 }, finalReport: { reportBody: "Published historical disclosure", version: 4, approvalStatus: "finalized", finalizedAt: "2026-07-24T12:05:00Z" } } as InspectionBundle;
  render(<ConditionReportDocument bundle={bundle} />);
  expect(screen.getByText("Published history · current-QC status unverified")).not.toHaveClass("released");
  expect(screen.getByText(/Refresh the inspection before relying on it as a current-policy release/)).toBeInTheDocument();
});

it("keeps current-policy finalized reports distinct from historical releases", () => {
  const bundle = { requiresReinspection: false, inspection: { year: 2022, make: "Ford", model: "Escape", vin: "TEST", mileage: 1000 }, finalReport: { reportBody: "Current reviewed disclosure", version: 4, approvalStatus: "finalized", finalizedAt: "2026-10-13T12:05:00Z" } } as InspectionBundle;
  render(<ConditionReportDocument bundle={bundle} />);
  expect(screen.getByText("Finalized")).toHaveClass("released");
  expect(screen.getByText("v4 · finalized")).toBeInTheDocument();
  expect(screen.queryByText(/not certified under the current evidence-QC policy/)).not.toBeInTheDocument();
});
