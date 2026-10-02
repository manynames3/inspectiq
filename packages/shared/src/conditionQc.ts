import { z } from "zod";

export const inspectorChecklistAreas = ["exterior", "interior", "glass", "lights", "wheels", "tires", "warning_lights", "keys", "odor", "other"] as const;

export const InspectorObservationSchema = z.object({
  area: z.enum(inspectorChecklistAreas),
  outcome: z.enum(["damage_observed", "no_visible_damage", "unable_to_assess", "not_checked"]),
  notes: z.string().trim().min(1).max(800),
  photoId: z.string().uuid().nullable().default(null),
  operationId: z.string().uuid()
}).strict();

export type InspectorObservation = z.infer<typeof InspectorObservationSchema> & {
  id: string;
  recordedBy: string;
  recordedAt: string;
};

export type ConditionQcIssue = {
  id: string;
  fingerprint: string;
  category: "coverage" | "quality" | "identity" | "duplicate" | "unsupported_claim" | "analysis" | "review";
  title: string;
  detail: string;
  action: string;
  photoIds: string[];
  suggestionId?: string;
  objective: boolean;
  status: "open" | "reviewed" | "overridden";
  decision?: { actor: string; reason: string; decidedAt: string };
};

export type ConditionQcAssessment = {
  draftSections?: import("./index.js").ConditionReportSection[];
  sourceFingerprint: string;
  issues: ConditionQcIssue[];
  observations: InspectorObservation[];
  identity: Record<"vin" | "odometer", {
    status: "verified" | "discrepancy" | "unable_to_verify";
    expected: string;
    observed: string | null;
    photoId: string | null;
  }>;
  openCount: number;
  objectiveBlockerCount: number;
  reviewRequiredCount: number;
  publicationReady: boolean;
};

export const ConditionQcReviewSchema = z.object({
  issueId: z.string().min(1).max(200),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["reviewed", "overridden"]),
  reason: z.string().trim().min(10).max(1000)
}).strict();
