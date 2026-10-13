import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createReinspection } from "../api.js";
import type { Actor, Inspection } from "../types.js";
import { ReinspectionControls, ReinspectionLineage } from "./ReinspectionControls.js";

vi.mock("../api.js", async () => ({ ...await vi.importActual<typeof import("../api.js")>("../api.js"), createReinspection: vi.fn() }));
const reviewer: Actor = { id: "reviewer-one", name: "Reviewer One", role: "reviewer" };
const replacement = { id: "replacement-inspection", status: "DRAFT" } as Inspection;
beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(createReinspection).mockResolvedValue({ inspection: replacement, reused: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function mount(actor = reviewer, authorized = true, historical = true) {
  const onCreated = vi.fn();
  render(<ReinspectionControls inspectionId="original-inspection" reportVersion={3} actor={actor} authorized={authorized} historical={historical} onCreated={onCreated} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
  return onCreated;
}

describe("audited web reinspection", () => {
  it("explains the historical boundary without permitting evaluation mutations", () => {
    mount({ ...reviewer, id: "evaluation-reviewer" }, true);
    expect(screen.getByText(/not certified under today’s QC policy/)).toBeInTheDocument();
    expect(screen.getByText(/Sign in with an Inspector, Reviewer, or Admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start audited reinspection" })).not.toBeInTheDocument();
    expect(createReinspection).not.toHaveBeenCalled();
  });

  it("keeps unauthorized roles out of the mutation form", () => {
    mount({ id: "technician-one", name: "Technician", role: "technician" }, false, false);
    expect(screen.getByRole("button", { name: "Start audited reinspection" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("validates the reason, submits the source version, and opens the replacement", async () => {
    const onCreated = mount();
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    expect(screen.getByRole("dialog", { name: "Start an audited reinspection" })).toBeInTheDocument();
    const reason = screen.getByLabelText("Reason for reinspection");
    expect(reason).toHaveFocus();
    expect(screen.getByRole("button", { name: "Create fresh inspection" })).toBeDisabled();
    fireEvent.change(reason, { target: { value: "Fresh condition evidence after the historical publication." } });
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(replacement));
    const [source, request, actor] = vi.mocked(createReinspection).mock.calls[0];
    expect(source).toBe("original-inspection");
    expect(request).toMatchObject({ reason: "Fresh condition evidence after the historical publication.", expectedReportVersion: 3 });
    expect(request.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(actor).toEqual(reviewer);
  });

  it("retries the same frozen operation after a lost response", async () => {
    vi.mocked(createReinspection).mockRejectedValueOnce(new Error("Response lost. Retry this request."));
    const onCreated = mount();
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    fireEvent.change(screen.getByLabelText("Reason for reinspection"), { target: { value: "Current-policy recapture with fresh reviewer decisions." } });
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Reason for reinspection")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    expect(screen.getByLabelText("Reason for reinspection")).toHaveValue("Current-policy recapture with fresh reviewer decisions.");
    vi.mocked(createReinspection).mockResolvedValueOnce({ inspection: replacement, reused: true });
    fireEvent.click(screen.getByRole("button", { name: "Retry same reinspection" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(replacement));
    expect(vi.mocked(createReinspection).mock.calls[1][1]).toEqual(vi.mocked(createReinspection).mock.calls[0][1]);
  });

  it("blocks creation offline and restores focus after cancel", () => {
    mount();
    const trigger = screen.getByRole("button", { name: "Start audited reinspection" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Reason for reinspection"), { target: { value: "Recapture current evidence for a new publication." } });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(screen.getByRole("button", { name: "Create fresh inspection" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Connect to the internet");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    expect(createReinspection).not.toHaveBeenCalled();
  });

  it("refreshes a definitely rejected stale version before allowing a fresh intent", async () => {
    vi.mocked(createReinspection).mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "Source report changed.", { expectedVersion: 3, actualVersion: 4 }));
    const onCreated = vi.fn();
    let view!: ReturnType<typeof render>;
    const onRefresh = vi.fn(async () => {
      view.rerender(<ReinspectionControls inspectionId="original-inspection" reportVersion={4} actor={reviewer} authorized historical onCreated={onCreated} onRefresh={onRefresh} />);
    });
    view = render(<ReinspectionControls inspectionId="original-inspection" reportVersion={3} actor={reviewer} authorized historical onCreated={onCreated} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    fireEvent.change(screen.getByLabelText("Reason for reinspection"), { target: { value: "Review fresh vehicle evidence under the current QC policy." } });
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent("latest published version is loaded");
    expect(screen.getByLabelText("Reason for reinspection")).not.toHaveAttribute("readonly");
    expect(screen.getByText(/Published report v4 stays unchanged/)).toBeInTheDocument();
    expect(createReinspection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(replacement));
    const [first, second] = vi.mocked(createReinspection).mock.calls.map((call) => call[1]);
    expect(first.expectedReportVersion).toBe(3);
    expect(second.expectedReportVersion).toBe(4);
    expect(second.operationId).not.toBe(first.operationId);
  });

  it("retains the frozen operation for other conflicts instead of risking another replacement", async () => {
    vi.mocked(createReinspection).mockRejectedValueOnce(new ApiClientError(409, "CONFLICT", "Operation already used."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    fireEvent.change(screen.getByLabelText("Reason for reinspection"), { target: { value: "Use fresh evidence and preserve the original publication." } });
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Reason for reinspection")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Retry same reinspection" }));
    await waitFor(() => expect(createReinspection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createReinspection).mock.calls[1][1]).toEqual(vi.mocked(createReinspection).mock.calls[0][1]);
  });

  it("does not claim the latest source version loaded when authoritative refresh fails", async () => {
    vi.mocked(createReinspection).mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "Source report changed."));
    const onRefresh = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    render(<ReinspectionControls inspectionId="original-inspection" reportVersion={3} actor={reviewer} authorized historical onCreated={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Start audited reinspection" }));
    fireEvent.change(screen.getByLabelText("Reason for reinspection"), { target: { value: "Review updated evidence without modifying the historical report." } });
    fireEvent.click(screen.getByRole("button", { name: "Create fresh inspection" }));
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("could not be refreshed");
    expect(message).toHaveTextContent("Network unavailable");
    expect(message).not.toHaveTextContent("latest published version is loaded");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(createReinspection).toHaveBeenCalledTimes(1);
  });

  it("links a replacement to its original inspection and immutable version", () => {
    render(<MemoryRouter><ReinspectionLineage inspection={{ ...replacement, reinspectionSourceInspectionId: "original-inspection", reinspectionSourceReportVersion: 3, reinspectionReason: "New verified evidence is required." }} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "View original inspection · published report v3" })).toHaveAttribute("href", "/inspections/original-inspection");
    expect(screen.getByText(/No prior evidence or approval is carried forward/)).toBeInTheDocument();
    expect(screen.getByText(/New verified evidence is required/)).toBeInTheDocument();
  });
});
