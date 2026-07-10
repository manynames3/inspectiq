import { mobileApi, MobileApiError } from "./client";
import type { MobileSession } from "../types";

const evaluation: MobileSession = {
  mode: "evaluation",
  actor: { id: "evaluation-reviewer", name: "Evaluation Reviewer", role: "reviewer" },
  idToken: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: Date.now() + 10000
};

describe("mobileApi", () => {
  it("blocks mutations before they leave an evaluation device", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(mobileApi("/api/reports/1", evaluation, { method: "PATCH", body: "{}" })).rejects.toMatchObject({ code: "EVALUATION_READ_ONLY" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes evaluation reads through the public read-only API", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } })
    } as Response);
    await expect(mobileApi<{ ok: boolean }>("/api/inspections", evaluation)).resolves.toEqual({ ok: true });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/evaluation/inspections");
  });

  it("preserves API error codes for version-conflict recovery", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "VERSION_CONFLICT", message: "Refresh first." } })
    } as Response);
    await expect(mobileApi("/api/inspections/1", { ...evaluation, mode: "oidc", idToken: "token" }, { method: "PATCH", body: "{}" }))
      .rejects.toEqual(expect.objectContaining<Partial<MobileApiError>>({ status: 409, code: "VERSION_CONFLICT" }));
  });
});
