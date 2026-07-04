import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DamageSeveritySchema, DamageTypeSchema, PhotoAngleSchema } from "@inspectiq/shared";
import { findSampleImage } from "../src/sampleImages.js";
import { getVisionProvider } from "../src/visionProvider.js";

const EvalCaseSchema = z.object({
  id: z.string().min(1),
  sampleKey: z.string().min(1),
  expectedAngle: PhotoAngleSchema,
  expectedOdometer: z.string().optional(),
  expectedVin: z.string().optional(),
  expectedDamagePresent: z.boolean(),
  expectedDamageType: DamageTypeSchema.optional(),
  expectedDamageSeverity: DamageSeveritySchema.optional(),
  expectedRetakeRequired: z.boolean()
});

const EvalSetSchema = z.object({
  name: z.string().min(1),
  thresholds: z.object({
    angleAccuracy: z.number().min(0).max(1),
    ocrAccuracy: z.number().min(0).max(1),
    damageRecall: z.number().min(0).max(1),
    damageTypeAccuracy: z.number().min(0).max(1),
    damageFalsePositiveRate: z.number().min(0).max(1),
    retakePrecision: z.number().min(0).max(1),
    retakeRecall: z.number().min(0).max(1)
  }),
  cases: z.array(EvalCaseSchema).min(1)
});

type EvalCase = z.infer<typeof EvalCaseSchema>;

function ratio(numerator: number, denominator: number, fallback = 1): number {
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function passAtLeast(actual: number, threshold: number): boolean {
  return actual + Number.EPSILON >= threshold;
}

function passAtMost(actual: number, threshold: number): boolean {
  return actual <= threshold + Number.EPSILON;
}

async function loadEvalSet() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const evalPath = process.env.VISION_EVAL_SET ?? path.join(root, "evals/vision-eval-set.json");
  const raw = await readFile(evalPath, "utf8");
  return EvalSetSchema.parse(JSON.parse(raw));
}

function ocrExpected(testCase: EvalCase): boolean {
  return Boolean(testCase.expectedOdometer || testCase.expectedVin);
}

const evalSet = await loadEvalSet();
const provider = getVisionProvider();
const caseResults = [];

for (const testCase of evalSet.cases) {
  const sample = findSampleImage(testCase.sampleKey);
  if (!sample) throw new Error(`Unknown sample image in eval set: ${testCase.sampleKey}`);

  const result = await provider.analyze({
    filename: sample.filename,
    storageKey: `/sample-images/${sample.filename}`,
    objectBucket: "inspectiq-sample-images",
    objectKey: `sample-images/${sample.filename}`,
    mimeType: sample.mimeType,
    declaredAngle: sample.angle
  });

  const damagePresent = result.validated.detectedDamageCandidates.length > 0;
  const primaryDamage = result.validated.detectedDamageCandidates[0] ?? null;
  const damageTypeCorrect = !testCase.expectedDamageType || primaryDamage?.damageType === testCase.expectedDamageType;
  const damageSeverityCorrect = !testCase.expectedDamageSeverity || primaryDamage?.severityEstimate === testCase.expectedDamageSeverity;
  const retakeRequired = result.validated.imageQuality.retakeRequired;
  const ocrCorrect = !ocrExpected(testCase)
    || (testCase.expectedOdometer ? result.validated.extractedText.odometer === testCase.expectedOdometer : true)
    && (testCase.expectedVin ? result.validated.extractedText.vin === testCase.expectedVin : true);

  caseResults.push({
    id: testCase.id,
    sampleKey: testCase.sampleKey,
    angleCorrect: result.validated.photoAngle === testCase.expectedAngle,
    ocrCorrect,
    expectedDamagePresent: testCase.expectedDamagePresent,
    damagePresent,
    damageTypeCorrect,
    damageSeverityCorrect,
    expectedRetakeRequired: testCase.expectedRetakeRequired,
    retakeRequired,
    confidence: result.validated.confidence,
    imageQuality: result.validated.imageQuality.grade
  });
}

const angleAccuracy = ratio(caseResults.filter((item) => item.angleCorrect).length, caseResults.length);
const ocrCases = caseResults.filter((item) => {
  const source = evalSet.cases.find((testCase) => testCase.id === item.id);
  return source ? ocrExpected(source) : false;
});
const ocrAccuracy = ratio(ocrCases.filter((item) => item.ocrCorrect).length, ocrCases.length);
const damageNegativeCases = caseResults.filter((item) => !item.expectedDamagePresent);
const damagePositiveCases = caseResults.filter((item) => item.expectedDamagePresent);
const damageTypedCases = caseResults.filter((item) => {
  const source = evalSet.cases.find((testCase) => testCase.id === item.id);
  return source ? Boolean(source.expectedDamageType || source.expectedDamageSeverity) : false;
});
const damageRecall = ratio(
  damagePositiveCases.filter((item) => item.damagePresent).length,
  damagePositiveCases.length
);
const damageTypeAccuracy = ratio(
  damageTypedCases.filter((item) => item.damageTypeCorrect && item.damageSeverityCorrect).length,
  damageTypedCases.length
);
const damageFalsePositiveRate = ratio(
  damageNegativeCases.filter((item) => item.damagePresent).length,
  damageNegativeCases.length,
  0
);
const predictedRetakes = caseResults.filter((item) => item.retakeRequired);
const expectedRetakes = caseResults.filter((item) => item.expectedRetakeRequired);
const trueRetakes = caseResults.filter((item) => item.retakeRequired && item.expectedRetakeRequired);
const retakePrecision = ratio(trueRetakes.length, predictedRetakes.length);
const retakeRecall = ratio(trueRetakes.length, expectedRetakes.length);

const metrics = {
  angleAccuracy: round(angleAccuracy),
  ocrAccuracy: round(ocrAccuracy),
  damageRecall: round(damageRecall),
  damageTypeAccuracy: round(damageTypeAccuracy),
  damageFalsePositiveRate: round(damageFalsePositiveRate),
  retakePrecision: round(retakePrecision),
  retakeRecall: round(retakeRecall)
};

const checks = {
  angleAccuracy: passAtLeast(metrics.angleAccuracy, evalSet.thresholds.angleAccuracy),
  ocrAccuracy: passAtLeast(metrics.ocrAccuracy, evalSet.thresholds.ocrAccuracy),
  damageRecall: passAtLeast(metrics.damageRecall, evalSet.thresholds.damageRecall),
  damageTypeAccuracy: passAtLeast(metrics.damageTypeAccuracy, evalSet.thresholds.damageTypeAccuracy),
  damageFalsePositiveRate: passAtMost(metrics.damageFalsePositiveRate, evalSet.thresholds.damageFalsePositiveRate),
  retakePrecision: passAtLeast(metrics.retakePrecision, evalSet.thresholds.retakePrecision),
  retakeRecall: passAtLeast(metrics.retakeRecall, evalSet.thresholds.retakeRecall)
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  evalSet: evalSet.name,
  provider: provider.name,
  promptVersion: provider.promptVersion,
  thresholds: evalSet.thresholds,
  metrics,
  checks,
  cases: caseResults
}, null, 2));

if (!ok && process.env.VISION_EVAL_ALLOW_FAIL !== "true") {
  process.exitCode = 1;
}
