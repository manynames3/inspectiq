import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountTokensCommand } from "@aws-sdk/client-bedrock-runtime";

const preflight = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), analyze: vi.fn(), config: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>(),
  BedrockRuntimeClient: class {
    constructor(config: unknown) { preflight.config(config); }
    send = preflight.send;
    destroy = preflight.destroy;
  }
}));
vi.mock("./visionProvider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./visionProvider.js")>();
  return {
    ...actual,
    bedrockVisionProvider: { ...actual.bedrockVisionProvider, analyze: preflight.analyze },
    getVisionProvider: () => ({ name: "localVisionProvider", promptVersion: "photo-analysis-v2", analyze: preflight.analyze })
  };
});

describe("free Bedrock cost preflight", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VISION_EVAL_PREFLIGHT_ONLY", "true");
    vi.stubEnv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("VISION_EVAL_OUTPUT", "");
    vi.stubEnv("VISION_EVAL_SET", "");
    delete process.env.VISION_EVAL_SET;
    preflight.send.mockResolvedValue({ inputTokens: 2000 });
    preflight.analyze.mockRejectedValue(new Error("Paid inference must never run in preflight."));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("preflight-complete"); });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("counts all 108 exact rendered inputs, never analyzes, and cannot be model-promotion evidence", async () => {
    await expect(import("../scripts/vision-eval.js")).rejects.toThrow("preflight-complete");
    expect(preflight.send).toHaveBeenCalledTimes(108);
    for (const [command] of preflight.send.mock.calls) {
      expect(command).toBeInstanceOf(CountTokensCommand);
      expect(command.input.modelId).toBe("anthropic.claude-sonnet-4-6");
      const content = command.input.input.converse.messages[0].content;
      expect(content[0].text).toContain("routing metadata, not visual evidence");
      expect(content[1].image.format).toBe("jpeg");
      expect(content[1].image.source.bytes[0]).toBe(0xff);
      expect(content[1].image.source.bytes[1]).toBe(0xd8);
    }
    const report = JSON.parse(vi.mocked(console.log).mock.calls[0]![0] as string);
    expect(report).toMatchObject({
      kind: "cost-preflight-only", ok: false, inferencePerformed: false,
      promptVersion: "photo-analysis-v5-recall-review", caseCount: 108,
      inputTokens: 216000, inputCostUsd: 0.7128, maximumOutputCostUsd: 2.4948,
      authorizedBudgetUsd: 1, singleAttemptUpperBoundWithinBudget: false
    });
    expect(report.singleAttemptMaximumInferenceCostUsd).toBeCloseTo(3.2076);
    expect(preflight.config).toHaveBeenCalledWith({ region: "us-east-1", maxAttempts: 1 });
    expect(preflight.analyze).not.toHaveBeenCalled();
    expect(preflight.destroy).toHaveBeenCalledOnce();
  }, 30000);

  it("rejects unverified model pricing before any AWS request", async () => {
    vi.stubEnv("BEDROCK_MODEL_ID", "unverified-model");
    await expect(import("../scripts/vision-eval.js")).rejects.toThrow("verified prices only");
    expect(preflight.send).not.toHaveBeenCalled();
    expect(preflight.analyze).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, 1.5, Number.NaN])("fails closed for invalid token count %s", async (inputTokens) => {
    preflight.send.mockResolvedValue({ inputTokens });
    await expect(import("../scripts/vision-eval.js")).rejects.toThrow("Missing valid token count");
    expect(preflight.send).toHaveBeenCalledTimes(1);
    expect(preflight.analyze).not.toHaveBeenCalled();
    expect(preflight.destroy).toHaveBeenCalledOnce();
    expect(console.log).not.toHaveBeenCalled();
  });
});
