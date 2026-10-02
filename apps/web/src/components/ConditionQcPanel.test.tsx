import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConditionQcAssessment } from "@inspectiq/shared";
import { ConditionQcPanel } from "./ConditionQcPanel.js";
import { api } from "../api.js";

vi.mock("../api.js", () => ({ api: vi.fn().mockResolvedValue({}) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const assessment: ConditionQcAssessment = {
  sourceFingerprint: "a".repeat(64), observations: [],
  identity: { vin: { status: "unable_to_verify", expected: "intake-vin", observed: null, photoId: null }, odometer: { status: "discrepancy", expected: "100", observed: "200", photoId: "photo" } },
  issues: [{ id: "identity:vin", fingerprint: "b".repeat(64), category: "identity", title: "VIN: unable to verify", detail: "No complete image reading.", action: "Review image or disclose limitation.", photoIds: ["photo"], objective: false, status: "open" }],
  openCount: 1, objectiveBlockerCount: 0, reviewRequiredCount: 1, publicationReady: false
};
function mount(locked = false) {
  const onChanged = vi.fn().mockResolvedValue(undefined), onPhoto = vi.fn();
  render(<ConditionQcPanel assessment={assessment} inspectionId="inspection" actor={{ id: "reviewer", name: "Reviewer", role: "reviewer" }} photos={[]} canRecord canReview locked={locked} onChanged={onChanged} onPhoto={onPhoto} onFinding={vi.fn()} />);
  return { onChanged, onPhoto };
}
describe("QC reviewer controls", () => {
  it("requires rationale and submits the evidence fingerprint without asserting verification", async () => {
    const { onChanged, onPhoto } = mount();
    expect(screen.getByRole("button", { name: "Acknowledge limitation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "View evidence" }));
    expect(onPhoto).toHaveBeenCalledWith("photo");
    fireEvent.change(screen.getByLabelText("Rationale for VIN: unable to verify"), { target: { value: "Disclose VIN unreadable pending targeted recapture." } });
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge limitation" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const payload = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({ issueId: "identity:vin", fingerprint: "b".repeat(64), decision: "reviewed" });
    expect(screen.getByText(/VIN · unable to verify/)).toBeInTheDocument();
  });
  it("saves attributed checklist data with a stable operation ID", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Inspector checklist note"), { target: { value: "Visible scuff at rear bumper; in-person observation." } });
    fireEvent.click(screen.getByRole("button", { name: "Save observation" }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    const payload = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({ area: "exterior", outcome: "damage_observed", photoId: null });
    expect(payload.operationId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("keeps evaluation/finalized records read-only", () => {
    mount(true);
    expect(screen.queryByRole("button", { name: "Save observation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Override judgment" })).not.toBeInTheDocument();
  });
});
