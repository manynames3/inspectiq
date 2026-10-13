import { useState } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { InspectionBundle } from "../types";
import { ReinspectionPanel } from "../components/ReinspectionPanel";
import { InspectionDetailScreen } from "./InspectionDetailScreen";

const mockRequest = jest.fn();
const mockRefresh = jest.fn();
let mockOnline = true;
let mockError: string | null = null;
let mockChild: InspectionBundle | null = null;
jest.mock("expo-crypto", () => ({ randomUUID: () => "e0fdb5ac-7c13-4c22-8d86-997304b3f763" }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { mode: "oidc", actor: { role: "reviewer" } }, canMutate: true }) }));
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ bundleById: () => mockChild, request: mockRequest, refresh: mockRefresh, online: mockOnline, error: mockError, loading: false, pendingUploads: [] }) }));
jest.mock("../components/ConditionQcPanel", () => ({ ConditionQcPanel: () => null }));
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = (props: Record<string, unknown>) => React.createElement(View, props);
  return Object.fromEntries(["Camera", "Check", "Circle", "FileText", "Play", "Sparkles", "AlertTriangle", "Inbox", "RefreshCw", "WifiOff", "ImageOff", "ChevronLeft", "ChevronRight", "Minus", "Plus", "X"].map((name) => [name, Icon]));
});

const source = {
  inspection: { id: "original", status: "FINALIZED" },
  finalReport: { id: "published", version: 3, finalizedAt: "2026-10-13T10:00:00Z", reportBody: "Original history" },
  requiresReinspection: true
} as InspectionBundle;
const child = {
  inspection: { id: "fresh", year: 2022, make: "Test", model: "Vehicle", trim: "Base", vin: "TEST", mileage: 31992, status: "DRAFT", completenessPercentage: 0, reinspectionSourceInspectionId: "original", reinspectionSourceReportVersion: 3, reinspectionReason: "Current-policy evidence requires reinspection." },
  photos: [], suggestions: [], damageItems: [], finalReport: null, readinessIssues: [], requiresReinspection: false
} as unknown as InspectionBundle;

function ReinspectionJourney() {
  const [inspectionId, setInspectionId] = useState("original");
  if (inspectionId === "original") return <ReinspectionPanel bundle={source} onOpenInspection={setInspectionId} />;
  return <InspectionDetailScreen route={{ key: "inspection", name: "InspectionDetail", params: { inspectionId } }} navigation={{ push: setInspectionId } as never} />;
}

beforeEach(() => {
  mockOnline = true;
  mockError = null;
  mockChild = null;
  mockRequest.mockReset().mockResolvedValue({ inspection: child.inspection, reused: false });
  mockRefresh.mockReset();
});

it("recovers a created reinspection after bootstrap disconnect without resubmitting the POST", async () => {
  const original = JSON.stringify(source);
  mockRefresh.mockImplementationOnce(async () => {
    // Workspace.refresh exposes an error but returns when refresh fails.
    mockOnline = false;
    mockError = "Connection lost during assignment refresh.";
  }).mockImplementation(async () => {
    mockOnline = true;
    mockError = null;
    mockChild = child;
  });
  const view = await render(<ReinspectionJourney />);
  await fireEvent.press(view.getByText("Start reinspection"));
  await fireEvent.changeText(view.getByLabelText("Reason for reinspection"), "Current-policy evidence requires reinspection.");
  await fireEvent.press(view.getByText("Create fresh inspection"));
  await waitFor(() => expect(view.getByText("Inspection not cached")).toBeTruthy());
  expect(view.getByText("Connection lost during assignment refresh.")).toBeTruthy();
  expect(view.getByText(/refresh here rather than creating another reinspection/)).toBeTruthy();
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByLabelText("Refresh workspace"));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(2));
  await view.rerender(<ReinspectionJourney />);
  expect(view.getByText("Fresh reinspection · linked history")).toBeTruthy();
  expect(view.getByText("Recorded reason: Current-policy evidence requires reinspection.")).toBeTruthy();
  expect(view.queryByText("Inspection not cached")).toBeNull();
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(source)).toBe(original);
});
