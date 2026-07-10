import { captureQualityFromSignals } from "./qualityPolicy";

describe("captureQualityFromSignals", () => {
  it("passes a sharp, exposed, high-resolution capture", () => {
    const result = captureQualityFromSignals({ width: 2048, height: 1536, brightness: 0.52, sharpness: 0.2, darkRatio: 0.02, brightRatio: 0.02 });
    expect(result.retakeRequired).toBe(false);
    expect(result.guidance).toEqual([]);
  });

  it("flags low resolution before upload", () => {
    const result = captureQualityFromSignals({ width: 800, height: 600, brightness: 0.5, sharpness: 0.2, darkRatio: 0, brightRatio: 0 });
    expect(result.resolutionOk).toBe(false);
    expect(result.guidance[0]).toContain("higher resolution");
  });

  it("flags dark and blurred evidence with actionable guidance", () => {
    const result = captureQualityFromSignals({ width: 1600, height: 1200, brightness: 0.14, sharpness: 0.04, darkRatio: 0.6, brightRatio: 0 });
    expect(result.exposureStatus).toBe("dark");
    expect(result.blurStatus).toBe("review");
    expect(result.guidance).toHaveLength(2);
  });

  it("flags glare-heavy evidence", () => {
    const result = captureQualityFromSignals({ width: 1600, height: 1200, brightness: 0.9, sharpness: 0.2, darkRatio: 0, brightRatio: 0.6 });
    expect(result.exposureStatus).toBe("bright");
    expect(result.guidance.join(" ")).toContain("glare");
  });
});
