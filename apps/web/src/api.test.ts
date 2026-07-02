import { describe, expect, it } from "vitest";
import { assetUrl } from "./api.js";

describe("assetUrl", () => {
  it("migrates legacy sample SVG paths to photographic JPEG assets", () => {
    expect(assetUrl("/sample-images/front-clean.svg")).toBe("/sample-images/front-clean.jpg");
  });

  it("keeps non-sample asset paths unchanged", () => {
    expect(assetUrl("/uploads/front-clean.svg")).toBe("/uploads/front-clean.svg");
  });
});
