import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./ReportsPage.js";
import { loadInspectionReviewRecords } from "./reviewData.js";
import type { InspectionBundle } from "../types.js";

const actor = { id: "reviewer", name: "Reviewer", role: "reviewer" };
vi.mock("../App.js", () => ({ useActor: () => ({ actor }) }));
vi.mock("./reviewData.js", () => ({ loadInspectionReviewRecords: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function showReport(requiresReinspection: boolean | undefined) {
  const bundle: InspectionBundle = {
    requiresReinspection,
    inspection: { id: "historical", year: 2022, make: "Ford", model: "Escape", trim: "Base", exteriorColor: "Blue", sellerSource: "Historical intake", inspectorName: "Original Inspector", vin: "HISTORY", status: "FINALIZED", mileage: 1000, completenessPercentage: 100, updatedAt: "2026-07-24T12:05:00Z", finalizedAt: "2026-07-24T12:05:00Z" },
    photos: [], suggestions: [], damageItems: [], imageAnalysisJobs: [], auditEvents: [], conditionGrade: null, aiReportDraft: null, aiReportJob: null,
    finalReport: { id: "published", version: 4, approvalStatus: "finalized", finalizedAt: "2026-07-24T12:05:00Z", finalizedBy: "Original Reviewer", approvedBy: "Original Reviewer", approvedAt: "2026-07-24T12:04:00Z", reviewerComment: "Historical approval", reportBody: "Original published disclosure" },
    readinessIssues: [], buyerVisibleReady: false
  };
  vi.mocked(loadInspectionReviewRecords).mockResolvedValue([{ inspection: bundle.inspection, bundle }]);
  render(<MemoryRouter><ReportsPage /></MemoryRouter>);
}

describe("report publication labels", () => {
  it("shows legacy releases as history instead of green current-policy finalized reports", async () => {
    showReport(true);
    expect(await screen.findByText("Historical release")).toHaveClass("report-historical-release");
    expect(screen.queryByText("Finalized")).not.toBeInTheDocument();
    expect(screen.getByText("Published history")).toBeInTheDocument();
  });

  it("does not infer current policy readiness from an omitted finalized policy flag", async () => {
    showReport(undefined);
    await screen.findByText("Original published disclosure");
    const labels = screen.getAllByText("Published history");
    expect(labels.some((element) => element.classList.contains("report-published-history"))).toBe(true);
    expect(screen.queryByText("Finalized")).not.toBeInTheDocument();
  });

  it("preserves the existing modern finalized presentation", async () => {
    showReport(false);
    await screen.findByText("Original published disclosure");
    expect(screen.getAllByText("Finalized").some((element) => element.classList.contains("report-finalized"))).toBe(true);
    expect(screen.queryByText("Published history")).not.toBeInTheDocument();
    expect(screen.queryByText("Historical release")).not.toBeInTheDocument();
  });
});
