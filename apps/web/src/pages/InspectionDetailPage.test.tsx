import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canRole, type RoleAction } from "@inspectiq/shared";
import { InspectionDetailPage } from "./InspectionDetailPage.js";
import { api, createReinspection } from "../api.js";
import type { Actor, InspectionBundle } from "../types.js";

const actor: Actor = { id: "reviewer", name: "Reviewer", role: "reviewer" };
vi.mock("../App.js", () => ({ useActor: () => ({ actor, can: (action: RoleAction) => canRole(actor.role, action) }) }));
vi.mock("../api.js", async () => ({ ...await vi.importActual<typeof import("../api.js")>("../api.js"), api: vi.fn(), createReinspection: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(requiresReinspection: boolean | undefined) {
  const bundle: InspectionBundle = {
    requiresReinspection,
    inspection: { id: "original", year: 2022, make: "Ford", model: "Escape", trim: "Base", exteriorColor: "Blue", sellerSource: "Historical intake", inspectorName: "Original Inspector", vin: "HISTORY", status: "FINALIZED", mileage: 1000, completenessPercentage: 100, updatedAt: "2026-07-24T12:05:00Z", finalizedAt: "2026-07-24T12:05:00Z" },
    photos: [], suggestions: [], damageItems: [], imageAnalysisJobs: [], auditEvents: [], conditionGrade: null, aiReportDraft: null, aiReportJob: null,
    finalReport: { id: "published", version: 4, approvalStatus: "finalized", finalizedAt: "2026-07-24T12:05:00Z", finalizedBy: "Original Reviewer", approvedBy: "Original Reviewer", approvedAt: "2026-07-24T12:04:00Z", reviewerComment: "Historical approval", reportBody: "Original published disclosure" },
    readinessIssues: [], buyerVisibleReady: false
  };
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/api/inspections/original") return bundle;
    if (path === "/api/inspections") return [bundle.inspection];
    if (path === "/api/reports/published/versions") return [];
    if (path === "/api/platform-health") return { samplePhotoSets: [] };
    throw new Error(`Unexpected test request: ${path}`);
  });
  return render(<MemoryRouter initialEntries={["/inspections/original"]}><Routes><Route path="/inspections/:id" element={<InspectionDetailPage />} /></Routes></MemoryRouter>);
}

describe("historical workbench presentation and backend capability", () => {
  it("shows a neutral historical header and rail without claiming current release completeness", async () => {
    const view = mount(true);
    await screen.findByRole("heading", { name: "Keep the original. Review fresh evidence." });
    expect(view.container.querySelector(".ledger-state.historical")).toHaveTextContent("Historical release · v4");
    expect(view.container.querySelector(".ledger-state.approved")).toBeNull();
    expect(screen.getByText("Historical review record.")).toBeInTheDocument();
    expect(screen.getByText(/This historical release is not certified under the current QC policy/)).toBeInTheDocument();
    expect(screen.queryByText(/All AI findings have been resolved and the condition report is locked/)).not.toBeInTheDocument();
    expect(view.container.querySelector(".review-empty-state.complete")).toBeNull();
    expect(screen.getByRole("button", { name: "Start audited reinspection" })).toBeEnabled();
    expect(createReinspection).not.toHaveBeenCalled();
  });

  it("withholds the new POST action when an older API omits its capability flag", async () => {
    const view = mount(undefined);
    await screen.findByRole("heading", { level: 1, name: "2022 Ford Escape" });
    expect(screen.getByRole("status")).toHaveTextContent("This API does not supply current policy status or reinspection capability");
    expect(view.container.querySelector(".ledger-state.historical")).toHaveTextContent("Published history · v4");
    expect(screen.queryByRole("button", { name: "Start audited reinspection" })).not.toBeInTheDocument();
    expect(createReinspection).not.toHaveBeenCalled();
  });

  it("retains the normal modern finalized header and reinspection action", async () => {
    const view = mount(false);
    await screen.findByRole("heading", { level: 1, name: "2022 Ford Escape" });
    expect(view.container.querySelector(".ledger-state.approved")).toHaveTextContent("Finalized · v4");
    expect(view.container.querySelector(".ledger-state.historical")).toBeNull();
    expect(screen.getByRole("button", { name: "Start audited reinspection", hidden: true })).toBeEnabled();
    expect(screen.queryByText(/This API does not supply current policy status/)).not.toBeInTheDocument();
  });
});
