import { api } from "../api.js";
import type { Actor, Inspection, InspectionBundle } from "../types.js";

export type InspectionReviewRecord = {
  inspection: Inspection;
  bundle: InspectionBundle;
  bundleLoadError?: string;
};

const detailConcurrency = 4;

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

function fallbackBundle(inspection: Inspection): InspectionBundle {
  return {
    inspection,
    photos: [],
    imageAnalysisJobs: [],
    suggestions: [],
    damageItems: [],
    conditionGrade: inspection.conditionGrade ?? null,
    aiReportJob: null,
    aiReportDraft: null,
    finalReport: null,
    auditEvents: [],
    readinessIssues: inspection.readinessIssueCount
      ? [{
        type: "image_analysis_failed",
        severity: "blocker",
        label: "Readiness details temporarily unavailable",
        detail: "The inspection summary is available, but detailed readiness inputs could not be loaded.",
        action: "Refresh the queue or open the inspection record."
      }]
      : [],
    buyerVisibleReady: Boolean(inspection.buyerVisibleReady)
  };
}

export async function loadInspectionReviewRecords(actor: Actor): Promise<InspectionReviewRecord[]> {
  const inspections = await api<Inspection[]>("/api/inspections", {}, actor);
  return mapWithConcurrency(inspections, detailConcurrency, async (inspection) => {
    try {
      return {
        inspection,
        bundle: await api<InspectionBundle>(`/api/inspections/${inspection.id}`, {}, actor)
      };
    } catch (error) {
      return {
        inspection,
        bundle: fallbackBundle(inspection),
        bundleLoadError: error instanceof Error ? error.message : "Inspection detail temporarily unavailable."
      };
    }
  });
}
