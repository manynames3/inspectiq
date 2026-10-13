import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ReportEditorScreen } from "./ReportEditorScreen";
import type { InspectionBundle } from "../types";

const mockRequest = jest.fn().mockResolvedValue([]);
const makeBundle = () => ({
  inspection: { id: "inspection", year: 2022, make: "Ford", model: "Escape", vin: "TEST" },
  conditionGrade: null,
  finalReport: { id: "report", version: 3, reportBody: "Reviewed disclosure", reviewerComment: "", approvalStatus: "approved", approvedBy: "Review Lead", finalizedAt: null }
} as InspectionBundle);
let mockBundle = makeBundle();
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { mode: "oidc", actor: { role: "reviewer" } }, canMutate: true }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ bundleById: () => mockBundle, request: mockRequest, refresh: jest.fn(), online: true }) }));
jest.mock("../components/BrandWordmark", () => ({ BrandWordmark: () => null }));

beforeEach(() => {
  mockBundle = makeBundle();
  mockRequest.mockReset().mockResolvedValue([]);
});

it("does not approve or release unsaved report language", async () => {
  const view = await render(<ReportEditorScreen route={{ key: "editor", name: "ReportEditor", params: { inspectionId: "inspection" } }} navigation={{} as never} />);
  await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("/api/reports/report/versions"));
  await fireEvent.changeText(view.getByLabelText("Buyer-facing report"), "New unreviewed disclosure");
  expect(view.getByText("UNSAVED DRAFT · NOT REVIEWED")).toBeTruthy();
  mockRequest.mockClear();
  await fireEvent.press(view.getByText("Approve report"));
  await fireEvent.press(view.getByText("Finalize buyer report"));
  expect(mockRequest).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText("Buyer-facing report"), "Reviewed disclosure");
  expect(view.getByText("APPROVED · AWAITING RELEASE")).toBeTruthy();
});

it("labels a legacy published report as historical without unlocking the old report", async () => {
  mockBundle.inspection.status = "FINALIZED";
  mockBundle.requiresReinspection = true;
  mockBundle.finalReport!.approvalStatus = "finalized";
  mockBundle.finalReport!.finalizedAt = "2026-10-13T10:00:00Z";
  const view = await render(<ReportEditorScreen route={{ key: "editor", name: "ReportEditor", params: { inspectionId: "inspection" } }} navigation={{ push: jest.fn() } as never} />);
  expect(view.getByText("HISTORICAL RELEASE · VERSION 3 · QC REINSPECTION REQUIRED")).toBeTruthy();
  expect(view.getByLabelText("Buyer-facing report").props.editable).toBe(false);
  expect(view.queryByText("Save report version")).toBeNull();
  expect(view.queryByText("Approve report")).toBeNull();
  expect(view.queryByText("Finalize buyer report")).toBeNull();
  expect(view.getByText("Start reinspection")).toBeTruthy();
  expect(view.getByText("Reviewed disclosure")).toBeTruthy();
});
