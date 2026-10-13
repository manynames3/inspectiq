import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ConditionQcPanel } from "./ConditionQcPanel";
import type { InspectionBundle } from "../types";
import type { ConditionQcAssessment } from "@inspectiq/shared";

const mockRequest = jest.fn().mockResolvedValue({});
const mockRefresh = jest.fn().mockResolvedValue(undefined);
let mockOnline = true;
jest.mock("expo-crypto", () => ({ randomUUID: () => "e0fdb5ac-7c13-4c22-8d86-997304b3f763" }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { actor: { id: "reviewer", name: "Reviewer", role: "reviewer" } }, canMutate: true }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ request: mockRequest, refresh: mockRefresh, online: mockOnline }) }));
const qc: ConditionQcAssessment = {
  sourceFingerprint: "a".repeat(64), observations: [],
  identity: { vin: { status: "unable_to_verify", expected: "vin", observed: null, photoId: null }, odometer: { status: "unable_to_verify", expected: "100", observed: null, photoId: null } },
  issues: [{ id: "identity:vin", fingerprint: "b".repeat(64), category: "identity", title: "VIN: unable to verify", detail: "No readable plate.", action: "Recapture or disclose.", photoIds: ["photo"], objective: false, status: "open" }],
  openCount: 1, objectiveBlockerCount: 0, reviewRequiredCount: 1, publicationReady: false
};
const bundle = { inspection: { id: "inspection", status: "DRAFT" }, photos: [], conditionQc: qc } as unknown as InspectionBundle;
beforeEach(() => { mockOnline = true; mockRequest.mockClear(); mockRefresh.mockClear(); });
describe("mobile condition-QC controls", () => {
  it("links evidence and submits a reasoned decision with the fingerprint", async () => {
    const onPhoto = jest.fn();
    const view = await render(<ConditionQcPanel bundle={bundle} onPhoto={onPhoto} onFinding={jest.fn()} />);
    await fireEvent.press(view.getByText("View evidence"));
    expect(onPhoto).toHaveBeenCalledWith("photo");
    await fireEvent.changeText(view.getByLabelText("Rationale for VIN: unable to verify"), "Unable to read plate; disclose this limitation.");
    await fireEvent.press(view.getByText("Acknowledge limitation"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(JSON.parse(mockRequest.mock.calls[0][1].body)).toMatchObject({ fingerprint: "b".repeat(64), decision: "reviewed" });
  });
  it("does not pretend offline notes or decisions are saved/queued", async () => {
    mockOnline = false;
    const view = await render(<ConditionQcPanel bundle={bundle} onPhoto={jest.fn()} onFinding={jest.fn()} />);
    expect(view.queryByText("Acknowledge limitation")).toBeNull();
    expect(view.queryByText("Add inspector note / checklist")).toBeNull();
    expect(view.getByText(/not queued offline/)).toBeTruthy();
  });
});
