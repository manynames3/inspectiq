import { fireEvent, render } from "@testing-library/react-native";
import type { UserRole } from "@inspectiq/shared";
import type { InspectionBundle } from "../types";
import { CaptureScreen } from "./CaptureScreen";

let mockRole: UserRole = "inspector";
let mockMode: "oidc" | "evaluation" = "oidc";
let mockOnline = true;
let mockBundle: InspectionBundle | null;
const mockQueueUpload = jest.fn();
const mockCapture = jest.fn();
const mockPermission = jest.fn();
jest.mock("expo-camera", () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true }, mockPermission] }));
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../capture/quality", () => ({ prepareCapture: (...args: unknown[]) => mockCapture(...args) }));
jest.mock("../offline/database", () => ({ queueUploadOperation: (...args: unknown[]) => mockQueueUpload(...args) }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { mode: mockMode, actor: { role: mockRole } }, canMutate: mockMode === "oidc" }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ bundleById: () => mockBundle, pendingUploads: [], online: mockOnline, refresh: jest.fn(), syncNow: jest.fn() }) }));

beforeEach(() => {
  mockMode = "oidc";
  mockRole = "inspector";
  mockOnline = true;
  mockBundle = { inspection: { id: "inspection", status: "DRAFT" }, photos: [] } as unknown as InspectionBundle;
  mockQueueUpload.mockClear();
  mockCapture.mockClear();
  mockPermission.mockClear();
});

it.each([true, false])("does not capture or queue against a finalized record when online=%s", async (online) => {
  mockOnline = online;
  mockBundle!.inspection.status = "FINALIZED";
  const goBack = jest.fn();
  const view = await render(<CaptureScreen route={{ key: "capture", name: "Capture", params: { inspectionId: "inspection" } }} navigation={{ goBack } as never} />);
  expect(view.getByText("Published inspection is locked")).toBeTruthy();
  expect(view.queryByLabelText("Capture Front photo")).toBeNull();
  expect(view.queryByText("Queue upload")).toBeNull();
  expect(mockQueueUpload).not.toHaveBeenCalled();
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockPermission).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Back to inspection"));
  expect(goBack).toHaveBeenCalledTimes(1);
});

it.each(["reviewer", "recon_coordinator", "consignor_approver", "technician"] as UserRole[])("does not expose camera capture to %s via a direct/back-stack route", async (role) => {
  mockRole = role;
  const view = await render(<CaptureScreen route={{ key: "capture", name: "Capture", params: { inspectionId: "inspection" } }} navigation={{ goBack: jest.fn() } as never} />);
  expect(view.getByText("Capture unavailable")).toBeTruthy();
  expect(view.queryByLabelText("Capture Front photo")).toBeNull();
  expect(mockQueueUpload).not.toHaveBeenCalled();
});

it("does not expose evaluation or unavailable assignments to local capture", async () => {
  mockMode = "evaluation";
  mockBundle = null;
  const view = await render(<CaptureScreen route={{ key: "capture", name: "Capture", params: { inspectionId: "inspection" } }} navigation={{ goBack: jest.fn() } as never} />);
  expect(view.getByText("Capture unavailable")).toBeTruthy();
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockQueueUpload).not.toHaveBeenCalled();
});
