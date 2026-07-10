import { roleFromClaims } from "./claims";

describe("roleFromClaims", () => {
  it("uses the explicit InspectIQ custom role", () => {
    expect(roleFromClaims({ "custom:inspectiq_role": "reviewer" })).toBe("reviewer");
  });

  it("accepts Cognito groups with the product prefix", () => {
    expect(roleFromClaims({ "cognito:groups": ["InspectIQAdmin"] })).toBe("admin");
  });

  it("falls back to least-privileged Inspector", () => {
    expect(roleFromClaims({ email: "operator@example.com" })).toBe("inspector");
  });
});
