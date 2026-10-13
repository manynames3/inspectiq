import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUrl, createReinspection } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("assetUrl", () => {
  it("migrates legacy sample SVG paths to photographic JPEG assets", () => {
    expect(assetUrl("/sample-images/front-clean.svg")).toBe("/sample-images/front-clean.jpg");
  });

  it("keeps non-sample asset paths unchanged", () => {
    expect(assetUrl("/uploads/front-clean.svg")).toBe("/uploads/front-clean.svg");
  });
});

it("posts the audited reinspection intent without mutating the original report", async () => {
  const inspection = { id: "replacement", status: "DRAFT" };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { inspection, reused: true } }) });
  vi.stubGlobal("fetch", fetchMock);
  const input = { reason: "Fresh evidence required for current-policy review.", operationId: "61da2d31-802b-4a94-9448-fc25b06f04fb", expectedReportVersion: 3 };
  const result = await createReinspection("original", input, { id: "reviewer", name: "Reviewer", role: "reviewer" });
  expect(result).toEqual({ inspection, reused: true });
  expect(fetchMock).toHaveBeenCalledWith("/api/inspections/original/reinspections", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
});
