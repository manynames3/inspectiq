import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { DamageSeveritySchema, DamageTypeSchema, PhotoAngleSchema } from "@inspectiq/shared";
import { findSampleImage, sampleImageFilePath } from "../src/sampleImages.js";
import { getVisionProvider } from "../src/visionProvider.js";

const SourceCaseSchema = z.object({
  id: z.string().min(1),
  sampleKey: z.string().min(1),
  rightsStatus: z.literal("rights-cleared"),
  expectedAngle: PhotoAngleSchema,
  expectedOdometer: z.string().optional(),
  expectedVin: z.string().optional(),
  expectedDamagePresent: z.boolean(),
  expectedDamageType: DamageTypeSchema.optional(),
  expectedDamageSeverity: DamageSeveritySchema.optional(),
  baseRetakeRequired: z.boolean().default(false)
});

const VariantSchema = z.object({
  id: z.string().min(1),
  transform: z.enum(["baseline", "jpeg_65", "resize_960", "mild_dark", "mild_bright", "rotate_3", "blur_heavy", "low_light", "occluded"]),
  expectedRetakeRequired: z.boolean()
});

const EvalSetSchema = z.object({
  name: z.string().min(1),
  minimumCaseCount: z.number().int().min(100),
  thresholds: z.object({
    schemaValidity: z.number().min(0).max(1),
    macroAngleAccuracy: z.number().min(0).max(1),
    minimumPerAngleAccuracy: z.number().min(0).max(1),
    ocrAccuracy: z.number().min(0).max(1),
    damagePrecision: z.number().min(0).max(1),
    damageRecall: z.number().min(0).max(1),
    damageTypeAccuracy: z.number().min(0).max(1),
    retakePrecision: z.number().min(0).max(1),
    retakeRecall: z.number().min(0).max(1)
  }),
  sources: z.array(SourceCaseSchema).min(1),
  variants: z.array(VariantSchema).min(1)
});

type SourceCase = z.infer<typeof SourceCaseSchema>;
type Variant = z.infer<typeof VariantSchema>;

function ratio(numerator: number, denominator: number, fallback = 1): number {
  return denominator === 0 ? fallback : numerator / denominator;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function passAtLeast(actual: number, threshold: number): boolean {
  return actual + Number.EPSILON >= threshold;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function loadEvalSet() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const evalPath = process.env.VISION_EVAL_SET ?? path.join(root, "evals/vision-eval-set.json");
  const raw = await readFile(evalPath, "utf8");
  return { root, evalSet: EvalSetSchema.parse(JSON.parse(raw)) };
}

async function renderVariant(source: SourceCase, variant: Variant, outputDirectory?: string): Promise<{ filename: string; dataUrl: string }> {
  const sample = findSampleImage(source.sampleKey);
  if (!sample) throw new Error(`Unknown sample image: ${source.sampleKey}`);
  if (sample.storageKey?.startsWith("https://")) {
    throw new Error(`Evaluation source ${source.sampleKey} is externally referenced, not rights-cleared local evidence.`);
  }

  const sourcePath = sampleImageFilePath(sample.storageKey ?? sample.filename);
  let pipeline = sharp(sourcePath).rotate();
  if (variant.transform === "jpeg_65") pipeline = pipeline.jpeg({ quality: 65 });
  if (variant.transform === "resize_960") pipeline = pipeline.resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 86 });
  if (variant.transform === "mild_dark") pipeline = pipeline.modulate({ brightness: 0.76 }).jpeg({ quality: 88 });
  if (variant.transform === "mild_bright") pipeline = pipeline.modulate({ brightness: 1.18 }).jpeg({ quality: 88 });
  if (variant.transform === "rotate_3") pipeline = pipeline.rotate(3, { background: { r: 232, g: 236, b: 242, alpha: 1 } }).jpeg({ quality: 88 });
  if (variant.transform === "blur_heavy") pipeline = pipeline.blur(6).jpeg({ quality: 82 });
  if (variant.transform === "low_light") pipeline = pipeline.modulate({ brightness: 0.32, saturation: 0.82 }).jpeg({ quality: 82 });
  if (variant.transform === "occluded") {
    const metadata = await sharp(sourcePath).metadata();
    const width = Math.max(1, Math.floor((metadata.width ?? 800) * 0.34));
    const height = Math.max(1, Math.floor((metadata.height ?? 600) * 0.28));
    const overlay = await sharp({ create: { width, height, channels: 4, background: { r: 17, g: 24, b: 39, alpha: 0.92 } } }).png().toBuffer();
    pipeline = pipeline.composite([{ input: overlay, gravity: "centre" }]).jpeg({ quality: 84 });
  }
  if (variant.transform === "baseline") pipeline = pipeline.jpeg({ quality: 92 });

  const filename = `eval-${variant.id}__${source.sampleKey}.jpg`;
  const bytes = await pipeline.toBuffer();
  if (outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, filename), bytes);
  }
  return { filename, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` };
}

const { root, evalSet } = await loadEvalSet();
const provider = getVisionProvider();
const outputDirectory = process.env.VISION_EVAL_CORPUS_DIR
  ? path.resolve(process.env.VISION_EVAL_CORPUS_DIR)
  : undefined;
const expandedCases = evalSet.sources.flatMap((source) => evalSet.variants.map((variant) => ({
  source,
  variant,
  id: `${source.id}__${variant.id}`,
  expectedRetakeRequired: source.baseRetakeRequired || variant.expectedRetakeRequired
})));

if (expandedCases.length < evalSet.minimumCaseCount) {
  throw new Error(`Evaluation corpus expands to ${expandedCases.length} images; at least ${evalSet.minimumCaseCount} are required.`);
}

const caseResults: Array<Record<string, unknown> & {
  schemaValid: boolean;
  scoreAngle: boolean;
  angleCorrect: boolean;
  expectedAngle: z.infer<typeof PhotoAngleSchema>;
  scoreOcr: boolean;
  ocrCorrect: boolean;
  scoreDamage: boolean;
  expectedDamagePresent: boolean;
  damagePresent: boolean;
  damageTypeCorrect: boolean;
  expectedRetakeRequired: boolean;
  retakeRequired: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
}> = [];

for (const testCase of expandedCases) {
  const { source, variant, expectedRetakeRequired } = testCase;
  try {
    const image = await renderVariant(source, variant, outputDirectory);
    const result = await provider.analyze({
      filename: image.filename,
      storageKey: image.dataUrl,
      objectBucket: "inspectiq-evaluation-corpus",
      objectKey: null,
      mimeType: "image/jpeg",
      declaredAngle: source.expectedAngle
    });
    const damagePresent = result.validated.detectedDamageCandidates.length > 0;
    const primaryDamage = result.validated.detectedDamageCandidates[0] ?? null;
    const scoreOcr = !expectedRetakeRequired && Boolean(source.expectedOdometer || source.expectedVin);
    const scoreDamage = !expectedRetakeRequired;
    const ocrCorrect = !scoreOcr || (source.expectedOdometer ? result.validated.extractedText.odometer === source.expectedOdometer : true)
      && (source.expectedVin ? result.validated.extractedText.vin === source.expectedVin : true);
    caseResults.push({
      id: testCase.id,
      sourceId: source.id,
      sampleKey: source.sampleKey,
      rightsStatus: source.rightsStatus,
      variant: variant.id,
      schemaValid: result.metadata.schemaValid,
      scoreAngle: !expectedRetakeRequired,
      angleCorrect: result.validated.photoAngle === source.expectedAngle,
      expectedAngle: source.expectedAngle,
      scoreOcr,
      ocrCorrect,
      scoreDamage,
      expectedDamagePresent: source.expectedDamagePresent,
      damagePresent,
      damageTypeCorrect: !source.expectedDamageType || primaryDamage?.damageType === source.expectedDamageType,
      damageSeverityCorrect: !source.expectedDamageSeverity || primaryDamage?.severityEstimate === source.expectedDamageSeverity,
      expectedRetakeRequired,
      retakeRequired: result.validated.imageQuality.retakeRequired,
      confidence: result.validated.confidence,
      imageQuality: result.validated.imageQuality.grade,
      modelId: result.metadata.modelId,
      latencyMs: result.metadata.latencyMs,
      inputTokens: result.metadata.inputTokens,
      outputTokens: result.metadata.outputTokens,
      totalTokens: result.metadata.totalTokens,
      estimatedCostUsd: result.metadata.estimatedCostUsd,
      fallbackUsed: result.metadata.fallbackUsed,
      failureCategory: result.metadata.failureCategory
    });
  } catch (error) {
    caseResults.push({
      id: testCase.id,
      sourceId: source.id,
      sampleKey: source.sampleKey,
      rightsStatus: source.rightsStatus,
      variant: variant.id,
      schemaValid: false,
      scoreAngle: !expectedRetakeRequired,
      angleCorrect: false,
      expectedAngle: source.expectedAngle,
      scoreOcr: !expectedRetakeRequired && Boolean(source.expectedOdometer || source.expectedVin),
      ocrCorrect: false,
      scoreDamage: !expectedRetakeRequired,
      expectedDamagePresent: source.expectedDamagePresent,
      damagePresent: false,
      damageTypeCorrect: false,
      damageSeverityCorrect: false,
      expectedRetakeRequired,
      retakeRequired: false,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      fallbackUsed: false,
      failureCategory: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

const schemaValidity = ratio(caseResults.filter((item) => item.schemaValid).length, caseResults.length);
const angleCases = caseResults.filter((item) => item.scoreAngle && item.schemaValid);
const angles = [...new Set(angleCases.map((item) => item.expectedAngle))].sort();
const perAngleAccuracy = Object.fromEntries(angles.map((angle) => {
  const cases = angleCases.filter((item) => item.expectedAngle === angle);
  return [angle, round(ratio(cases.filter((item) => item.angleCorrect).length, cases.length))];
}));
const macroAngleAccuracy = ratio(Object.values(perAngleAccuracy).reduce((sum, value) => sum + value, 0), Object.keys(perAngleAccuracy).length);
const minimumPerAngleAccuracy = Math.min(...Object.values(perAngleAccuracy));
const ocrCases = caseResults.filter((item) => item.scoreOcr && item.schemaValid);
const ocrAccuracy = ratio(ocrCases.filter((item) => item.ocrCorrect).length, ocrCases.length);
const damageCases = caseResults.filter((item) => item.scoreDamage && item.schemaValid);
const damageTruePositives = damageCases.filter((item) => item.expectedDamagePresent && item.damagePresent).length;
const damageFalsePositives = damageCases.filter((item) => !item.expectedDamagePresent && item.damagePresent).length;
const damageFalseNegatives = damageCases.filter((item) => item.expectedDamagePresent && !item.damagePresent).length;
const damagePrecision = ratio(damageTruePositives, damageTruePositives + damageFalsePositives);
const damageRecall = ratio(damageTruePositives, damageTruePositives + damageFalseNegatives);
const typedDamageCases = damageCases.filter((item) => item.expectedDamagePresent);
const damageTypeAccuracy = ratio(typedDamageCases.filter((item) => item.damagePresent && item.damageTypeCorrect && item.damageSeverityCorrect === true).length, typedDamageCases.length);
const predictedRetakes = caseResults.filter((item) => item.retakeRequired);
const expectedRetakes = caseResults.filter((item) => item.expectedRetakeRequired);
const trueRetakes = caseResults.filter((item) => item.retakeRequired && item.expectedRetakeRequired);
const retakePrecision = ratio(trueRetakes.length, predictedRetakes.length);
const retakeRecall = ratio(trueRetakes.length, expectedRetakes.length);

const metrics = {
  corpusImages: caseResults.length,
  independentSourceImages: evalSet.sources.length,
  schemaValidity: round(schemaValidity),
  macroAngleAccuracy: round(macroAngleAccuracy),
  minimumPerAngleAccuracy: round(minimumPerAngleAccuracy),
  perAngleAccuracy,
  ocrAccuracy: round(ocrAccuracy),
  damagePrecision: round(damagePrecision),
  damageRecall: round(damageRecall),
  damageTypeAccuracy: round(damageTypeAccuracy),
  retakePrecision: round(retakePrecision),
  retakeRecall: round(retakeRecall),
  p95LatencyMs: percentile(caseResults.map((item) => item.latencyMs), 0.95),
  inputTokens: caseResults.reduce((sum, item) => sum + item.inputTokens, 0),
  outputTokens: caseResults.reduce((sum, item) => sum + item.outputTokens, 0),
  totalTokens: caseResults.reduce((sum, item) => sum + item.totalTokens, 0),
  estimatedCostUsd: round(caseResults.reduce((sum, item) => sum + item.estimatedCostUsd, 0), 6),
  fallbackCount: caseResults.filter((item) => item.fallbackUsed).length,
  failureCount: caseResults.filter((item) => !item.schemaValid).length
};

const checks = {
  minimumCaseCount: metrics.corpusImages >= evalSet.minimumCaseCount,
  schemaValidity: passAtLeast(metrics.schemaValidity, evalSet.thresholds.schemaValidity),
  macroAngleAccuracy: passAtLeast(metrics.macroAngleAccuracy, evalSet.thresholds.macroAngleAccuracy),
  minimumPerAngleAccuracy: passAtLeast(metrics.minimumPerAngleAccuracy, evalSet.thresholds.minimumPerAngleAccuracy),
  ocrAccuracy: passAtLeast(metrics.ocrAccuracy, evalSet.thresholds.ocrAccuracy),
  damagePrecision: passAtLeast(metrics.damagePrecision, evalSet.thresholds.damagePrecision),
  damageRecall: passAtLeast(metrics.damageRecall, evalSet.thresholds.damageRecall),
  damageTypeAccuracy: passAtLeast(metrics.damageTypeAccuracy, evalSet.thresholds.damageTypeAccuracy),
  retakePrecision: passAtLeast(metrics.retakePrecision, evalSet.thresholds.retakePrecision),
  retakeRecall: passAtLeast(metrics.retakeRecall, evalSet.thresholds.retakeRecall)
};
const ok = Object.values(checks).every(Boolean);
const report = {
  ok,
  generatedAt: new Date().toISOString(),
  evalSet: evalSet.name,
  provider: provider.name,
  promptVersion: provider.promptVersion,
  mode: provider.name === "bedrockVisionProvider" ? "manual-model-promotion" : "deterministic-contract-ci",
  corpus: {
    minimumCaseCount: evalSet.minimumCaseCount,
    imageCount: caseResults.length,
    independentSourceImages: evalSet.sources.length,
    variantsPerSource: evalSet.variants.length,
    rightsStatus: "rights-cleared",
    generatedDirectory: outputDirectory ? path.relative(root, outputDirectory) : null
  },
  thresholds: evalSet.thresholds,
  metrics,
  checks,
  cases: caseResults
};

const output = JSON.stringify(report, null, 2);
console.log(output);
if (process.env.VISION_EVAL_OUTPUT) {
  const outputPath = path.resolve(process.env.VISION_EVAL_OUTPUT);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${output}\n`, "utf8");
}
if (!ok && process.env.VISION_EVAL_ALLOW_FAIL !== "true") process.exitCode = 1;
