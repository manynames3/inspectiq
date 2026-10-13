import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ReportEditorScreen } from "./ReportEditorScreen";
import type { InspectionBundle } from "../types";

const mockRequest = jest.fn().mockResolvedValue([]);
const mockBundle = {
  inspection: { id: "inspection", year: 2022, make: "Ford", model: "Escape", vin: "TEST" },
  conditionGrade: null,
  finalReport: { id: "report", version: 3, reportBody: "Reviewed disclosure", reviewerComment: "", approvalStatus: "approved", approvedBy: "Review Lead", finalizedAt: null }
} as InspectionBundle;
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { actor: { role: "reviewer" } }, canMutate: true }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ bundleById: () => mockBundle, request: mockRequest, refresh: jest.fn(), online: true }) }));
jest.mock("../components/BrandWordmark", () => ({ BrandWordmark: () => null }));

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
