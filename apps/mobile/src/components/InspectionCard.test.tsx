import { fireEvent, render } from "@testing-library/react-native";
import { InspectionCard } from "./InspectionCard";
import type { InspectionBundle } from "../types";

const bundle = {
  inspection: {
    id: "inspection-1",
    vin: "1FMCU9H6XNUB81389",
    year: 2022,
    make: "Ford",
    model: "Escape",
    trim: "SEL",
    mileage: 31992,
    exteriorColor: "Gray",
    sellerSource: "Offsite",
    inspectorName: "Inspector",
    status: "HUMAN_REVIEW_REQUIRED",
    completenessPercentage: 100,
    createdBy: "inspector",
    assignedToUserId: "inspector",
    version: 3,
    createdAt: "2026-07-09T12:00:00.000Z",
    updatedAt: "2026-07-09T12:00:00.000Z",
    finalizedAt: null
  },
  photos: [], suggestions: [], damageItems: [], conditionGrade: null, aiReportJob: null, aiReportDraft: null, finalReport: null, auditEvents: [],
  readinessIssues: [{ type: "unreviewed_ai_suggestion", severity: "blocker", label: "Review", detail: "One finding needs review.", action: "Review finding" }],
  buyerVisibleReady: false
} as InspectionBundle;

describe("InspectionCard", () => {
  it("presents vehicle, evidence, and release state without developer payloads", async () => {
    const view = await render(<InspectionCard bundle={bundle} onPress={jest.fn()} />);
    expect(view.getByText("2022 Ford Escape")).toBeTruthy();
    expect(view.getByText("1 release blocker")).toBeTruthy();
    expect(view.queryByText(/suggestedValueJson/)).toBeNull();
  });

  it("opens the selected inspection", async () => {
    const onPress = jest.fn();
    const view = await render(<InspectionCard bundle={bundle} onPress={onPress} />);
    await fireEvent.press(view.getByLabelText("Open 2022 Ford Escape"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
