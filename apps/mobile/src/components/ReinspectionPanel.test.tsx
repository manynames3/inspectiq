import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { UserRole } from "@inspectiq/shared";
import { MobileApiError } from "../api/client";
import type { InspectionBundle } from "../types";
import { ReinspectionPanel } from "./ReinspectionPanel";

const mockRequest = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockUuid = jest.fn();
let mockOnline = true;
let mockRole: UserRole = "reviewer";
let mockMode: "oidc" | "evaluation" = "oidc";
jest.mock("expo-crypto", () => ({ randomUUID: () => mockUuid() }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { mode: mockMode, actor: { role: mockRole } }, canMutate: mockMode === "oidc" }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ request: mockRequest, refresh: mockRefresh, online: mockOnline }) }));

function finalizedBundle(): InspectionBundle {
  return {
    inspection: { id: "original", status: "FINALIZED" },
    finalReport: { id: "published", version: 3, finalizedAt: "2026-10-13T10:00:00Z", reportBody: "Original published disclosure", approvalStatus: "finalized" },
    photos: [{ id: "original-photo" }],
    damageItems: [{ id: "original-finding" }],
    requiresReinspection: true
  } as InspectionBundle;
}

beforeEach(() => {
  mockOnline = true;
  mockRole = "reviewer";
  mockMode = "oidc";
  mockRequest.mockReset().mockResolvedValue({ inspection: { id: "fresh" }, reused: false });
  mockRefresh.mockClear();
  mockUuid.mockReset().mockReturnValue("e0fdb5ac-7c13-4c22-8d86-997304b3f763");
});

describe("native audited reinspection", () => {
  it("requires a reason, creates only a linked draft request, and preserves the source", async () => {
    const bundle = finalizedBundle();
    const source = JSON.stringify(bundle);
    const onOpenInspection = jest.fn();
    const view = await render(<ReinspectionPanel bundle={bundle} onOpenInspection={onOpenInspection} />);
    expect(view.getByText("Historical release · reinspection required")).toBeTruthy();
    await fireEvent.press(view.getByText("Start reinspection"));
    await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "Too short");
    await fireEvent.press(view.getByText("Create fresh inspection"));
    expect(mockRequest).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "  Verify fresh evidence against current QC rules.  ");
    await fireEvent.press(view.getByText("Create fresh inspection"));
    await waitFor(() => expect(onOpenInspection).toHaveBeenCalledWith("fresh"));
    expect(mockRequest).toHaveBeenCalledWith("/api/inspections/original/reinspections", {
      method: "POST",
      body: JSON.stringify({ reason: "Verify fresh evidence against current QC rules.", operationId: "e0fdb5ac-7c13-4c22-8d86-997304b3f763", expectedReportVersion: 3 })
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(bundle)).toBe(source);
  });

  it("reuses the identical operation, reason, and source version after a lost response", async () => {
    mockRequest.mockRejectedValueOnce(new Error("Connection lost"));
    const onOpenInspection = jest.fn();
    const view = await render(<ReinspectionPanel bundle={finalizedBundle()} onOpenInspection={onOpenInspection} />);
    await fireEvent.press(view.getByText("Start reinspection"));
    await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "New damage evidence needs a fresh inspection.");
    await fireEvent.press(view.getByText("Create fresh inspection"));
    await waitFor(() => expect(view.getByText("Connection lost")).toBeTruthy());
    expect(view.getByLabelText("Reason for reinspection").props.editable).toBe(false);
    expect(view.queryByText("Cancel reinspection")).toBeNull();
    mockRequest.mockResolvedValueOnce({ inspection: { id: "fresh" }, reused: true });
    await fireEvent.press(view.getByText("Retry reinspection"));
    await waitFor(() => expect(onOpenInspection).toHaveBeenCalledWith("fresh"));
    expect(mockRequest.mock.calls[1]).toEqual(mockRequest.mock.calls[0]);
    expect(mockUuid).toHaveBeenCalledTimes(1);
  });

  it("refreshes after a definite rejection instead of locking the reason forever", async () => {
    mockRequest.mockRejectedValueOnce(new MobileApiError(409, "REPORT_VERSION_CONFLICT", "Refresh the published version."));
    const view = await render(<ReinspectionPanel bundle={finalizedBundle()} onOpenInspection={jest.fn()} />);
    await fireEvent.press(view.getByText("Start reinspection"));
    await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "New evidence requires a current report.");
    await fireEvent.press(view.getByText("Create fresh inspection"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(view.getByLabelText("Reason for reinspection").props.editable).toBe(true);
    expect(view.getByText("Create fresh inspection")).toBeTruthy();
  });

  it("never sends or queues reinspection offline, including after the form was opened", async () => {
    const bundle = finalizedBundle();
    const view = await render(<ReinspectionPanel bundle={bundle} onOpenInspection={jest.fn()} />);
    await fireEvent.press(view.getByText("Start reinspection"));
    await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "Fresh evidence needs reviewer approval.");
    mockOnline = false;
    await view.rerender(<ReinspectionPanel bundle={bundle} onOpenInspection={jest.fn()} />);
    expect(view.getByText(/never queued offline/)).toBeTruthy();
    await fireEvent.press(view.getByText("Create fresh inspection"));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockUuid).not.toHaveBeenCalled();
  });

  it.each(["inspector", "reviewer", "admin"] as UserRole[])("offers an authenticated %s the amendment path for every finalized report", async (role) => {
    mockRole = role;
    const bundle = finalizedBundle();
    bundle.requiresReinspection = false;
    const view = await render(<ReinspectionPanel bundle={bundle} onOpenInspection={jest.fn()} />);
    expect(view.getByText("Start reinspection")).toBeTruthy();
    expect(view.queryByText("Historical release · reinspection required")).toBeNull();
  });

  it.each(["recon_coordinator", "consignor_approver", "technician"] as UserRole[])("does not offer %s a reinspection mutation", async (role) => {
    mockRole = role;
    const view = await render(<ReinspectionPanel bundle={finalizedBundle()} onOpenInspection={jest.fn()} />);
    expect(view.queryByText("Start reinspection")).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("shows the historical warning but no mutation in the Evaluation Workspace", async () => {
    mockMode = "evaluation";
    const view = await render(<ReinspectionPanel bundle={finalizedBundle()} onOpenInspection={jest.fn()} />);
    expect(view.getByText("Historical release · reinspection required")).toBeTruthy();
    expect(view.queryByText("Start reinspection")).toBeNull();
  });

  it.each([true, false])("does not offer unsupported reinspection or infer QC approval from an older record (online=%s)", async (online) => {
    mockOnline = online;
    const bundle = finalizedBundle();
    delete bundle.requiresReinspection;
    const view = await render(<ReinspectionPanel bundle={bundle} onOpenInspection={jest.fn()} />);
    expect(view.getByText("Published history · QC status unverified")).toBeTruthy();
    expect(view.getByText(/Update or reconnect to a QC-capable API/)).toBeTruthy();
    expect(view.queryByText("Start reinspection")).toBeNull();
    expect(view.queryByLabelText("Reason for reinspection")).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockUuid).not.toHaveBeenCalled();
  });

  it("links a fresh draft back to the untouched original and shows the audited reason", async () => {
    const onOpenInspection = jest.fn();
    const bundle = { inspection: { id: "fresh", status: "DRAFT", reinspectionSourceInspectionId: "original", reinspectionSourceReportId: "published", reinspectionSourceReportVersion: 3, reinspectionReason: "Fresh evidence requires current QC." }, finalReport: null } as InspectionBundle;
    const view = await render(<ReinspectionPanel bundle={bundle} onOpenInspection={onOpenInspection} />);
    expect(view.getByText(/published report version 3/)).toBeTruthy();
    expect(view.getByText("Recorded reason: Fresh evidence requires current QC.")).toBeTruthy();
    expect(view.queryByText("Start reinspection")).toBeNull();
    await fireEvent.press(view.getByText("View original inspection"));
    expect(onOpenInspection).toHaveBeenCalledWith("original");
  });
});
