import { z } from "zod";

export const fieldDamageCategories = ["dent", "scratch_scuff", "broken_glass_light", "damaged_missing_part"] as const;
const Category = z.enum(fieldDamageCategories);
const Id = z.string().trim().min(1).max(200);
export const FieldQcEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Id,
  model: z.object({
    provider: Id, modelId: Id, promptVersion: Id, codeCommit: z.string().regex(/^[a-f0-9]{7,40}$/i),
    startedAt: z.string().datetime(), completedAt: z.string().datetime()
  }).strict(),
  groundTruth: z.object({
    labeler: Id, adjudicator: Id, blindToPredictions: z.literal(true),
    lockedAt: z.string().datetime(), protocolReference: Id
  }).strict(),
  tuningVehicleIds: z.array(Id),
  tuningPhotoSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/i)),
  vehicles: z.array(z.object({
    vehicleId: Id,
    photos: z.array(z.object({
      photoId: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      rightsBasis: z.enum(["owned", "permission", "licensed", "public_domain"]),
      rightsReference: Id
    }).strict()).min(1),
    truth: z.array(z.object({
      id: Id, category: Category, location: Id, obvious: z.boolean(), visibleInPhotoIds: z.array(Id).min(1)
    }).strict()),
    predictions: z.array(z.object({
      id: Id, category: Category, photoId: Id, matchedTruthId: Id.nullable(),
      confidence: z.number().min(0).max(1).optional()
    }).strict()),
    unableToAssessPhotoIds: z.array(Id),
    timing: z.object({
      baselineReviewer: Id, assistedReviewer: Id,
      baselineSeconds: z.number().positive(), assistedSeconds: z.number().positive(),
      baselineMisses: z.number().int().nonnegative(), assistedMisses: z.number().int().nonnegative()
    }).strict().optional()
  }).strict()).min(1)
}).strict();
export type FieldQcEvaluation = z.infer<typeof FieldQcEvaluationSchema>;

function interval(hits: number, count: number) {
  if (!count) return null;
  const p = hits / count, z = 1.959963984540054, divisor = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / divisor;
  const radius = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / divisor;
  return { point: p, lower95: Math.max(0, center - radius), upper95: Math.min(1, center + radius) };
}
const unique = (values: string[], label: string) => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} invalidates the evaluation.`);
};

// Independent labels and rights are attestations in the manifest, not facts this calculator can certify.
export function evaluateFieldQc(raw: unknown) {
  const input = FieldQcEvaluationSchema.parse(raw);
  if (/local|reference|fixture|seed/i.test(input.model.provider)) throw new Error("Deterministic/reference providers are not field accuracy evidence.");
  if (input.groundTruth.labeler === input.groundTruth.adjudicator) throw new Error("Ground truth requires a separate independent adjudicator.");
  if (Date.parse(input.groundTruth.lockedAt) > Date.parse(input.model.startedAt)) throw new Error("Lock independent labels before running predictions.");
  if (Date.parse(input.model.completedAt) < Date.parse(input.model.startedAt)) throw new Error("Invalid model run timestamps.");
  unique(input.vehicles.map((v) => v.vehicleId), "vehicle IDs");
  unique(input.vehicles.flatMap((v) => v.photos.map((p) => p.photoId)), "photo IDs");
  unique(input.vehicles.flatMap((v) => v.photos.map((p) => p.sha256.toLowerCase())), "photo checksums");
  const rows = fieldDamageCategories.map((category) => ({ category, obviousTruth: 0, obviousHits: 0, supportedPredictions: 0, falsePositives: 0 }));
  let photos = 0, unableToAssess = 0, cleanControls = 0;
  const timePairs: NonNullable<FieldQcEvaluation["vehicles"][number]["timing"]>[] = [];
  for (const vehicle of input.vehicles) {
    if (input.tuningVehicleIds.includes(vehicle.vehicleId) || vehicle.photos.some((p) => input.tuningPhotoSha256.some((digest) => digest.toLowerCase() === p.sha256.toLowerCase()))) throw new Error("Held-out data overlaps tuning vehicles or images.");
    const photoIds = new Set(vehicle.photos.map((p) => p.photoId));
    unique(vehicle.truth.map((t) => t.id), "truth IDs");
    unique(vehicle.predictions.map((p) => p.id), "prediction IDs");
    unique(vehicle.unableToAssessPhotoIds, "unable-to-assess photo IDs");
    if (vehicle.truth.some((t) => t.visibleInPhotoIds.some((id) => !photoIds.has(id))) || vehicle.predictions.some((p) => !photoIds.has(p.photoId)) || vehicle.unableToAssessPhotoIds.some((id) => !photoIds.has(id))) throw new Error("Evaluation references evidence outside its vehicle.");
    const matched = new Set<string>();
    for (const prediction of vehicle.predictions) {
      const truth = vehicle.truth.find((t) => t.id === prediction.matchedTruthId);
      if (prediction.matchedTruthId && !truth) throw new Error("Prediction matches an unknown ground-truth finding.");
      const row = rows.find((r) => r.category === prediction.category)!;
      if (truth && !matched.has(truth.id) && truth.category === prediction.category && truth.visibleInPhotoIds.includes(prediction.photoId)) {
        row.supportedPredictions += 1;
        matched.add(truth.id);
      } else row.falsePositives += 1;
    }
    for (const truth of vehicle.truth.filter((t) => t.obvious)) {
      const row = rows.find((r) => r.category === truth.category)!;
      row.obviousTruth += 1;
      if (matched.has(truth.id)) row.obviousHits += 1;
    }
    if (vehicle.timing) {
      if (vehicle.timing.baselineReviewer === vehicle.timing.assistedReviewer) throw new Error("Timing needs separate reviewers to avoid same-case learning.");
      if ([vehicle.timing.baselineReviewer, vehicle.timing.assistedReviewer].some((reviewer) => [input.groundTruth.labeler, input.groundTruth.adjudicator].includes(reviewer))) throw new Error("Timing reviewers must be blind to the ground-truth labels.");
      timePairs.push(vehicle.timing);
    }
    photos += vehicle.photos.length;
    unableToAssess += vehicle.unableToAssessPhotoIds.length;
    if (!vehicle.truth.length) cleanControls += 1;
  }
  const sum = (field: keyof Omit<typeof rows[number], "category">) => rows.reduce((n, row) => n + row[field], 0);
  const recall = interval(sum("obviousHits"), sum("obviousTruth"));
  const precision = interval(sum("supportedPredictions"), sum("supportedPredictions") + sum("falsePositives"));
  const categories = rows.map((row) => ({ ...row, obviousMisses: row.obviousTruth - row.obviousHits, recall: interval(row.obviousHits, row.obviousTruth), precision: interval(row.supportedPredictions, row.supportedPredictions + row.falsePositives) }));
  const categoryCoverage = categories.every((row) => row.obviousTruth > 0 && row.precision != null);
  const baseline = timePairs.reduce((n, p) => n + p.baselineSeconds, 0);
  const assisted = timePairs.reduce((n, p) => n + p.assistedSeconds, 0);
  return {
    runId: input.runId, model: input.model, vehicleCount: input.vehicles.length, photoCount: photos, cleanControls,
    unableToAssessPhotoCount: unableToAssess,
    recall, precision, categories,
    // Abstaining does not remove known visible damage from the recall denominator.
    targets: { obviousDamageRecall: 0.95, predictionPrecision: 0.90 },
    pointTargetsMet: categoryCoverage && cleanControls > 0 && !!recall && recall.point >= 0.95 && !!precision && precision.point >= 0.90,
    everyCategoryPointTargetsMet: categories.every((row) => !!row.recall && row.recall.point >= 0.95 && !!row.precision && row.precision.point >= 0.90),
    binomialScreenMet: categoryCoverage && cleanControls > 0 && !!recall && recall.lower95 >= 0.95 && !!precision && precision.lower95 >= 0.90,
    reviewerTime: timePairs.length ? {
      pairedVehicles: timePairs.length, baselineSeconds: baseline, assistedSeconds: assisted,
      savedSecondsPerVehicle: (baseline - assisted) / timePairs.length,
      savedFraction: (baseline - assisted) / baseline,
      baselineMisses: timePairs.reduce((n, p) => n + p.baselineMisses, 0),
      assistedMisses: timePairs.reduce((n, p) => n + p.assistedMisses, 0),
      qualityGuardrailMet: timePairs.reduce((n, p) => n + p.assistedMisses - p.baselineMisses, 0) <= 0
    } : null,
    limitations: [
      "These are manifest-derived measurements, not independently certified claims or commercial readiness.",
      "Wilson intervals treat findings as independent; vehicle-level clustering and population representativeness require independent statistical review.",
      "Uncertain/abstained images remain in scope; known obvious findings in them still count as misses.",
      "Photo rights, independent/blinded labeling and held-out status require documentary verification.",
      "Model confidence is uncalibrated; it is not the probability a finding is correct."
    ]
  };
}
