import { api } from "../api.js";
import type { Inspection, InspectionBundle } from "../types.js";

export type InspectionReviewRecord = {
  inspection: Inspection;
  bundle: InspectionBundle;
};

export async function loadInspectionReviewRecords(): Promise<InspectionReviewRecord[]> {
  const inspections = await api<Inspection[]>("/api/inspections");
  return Promise.all(
    inspections.map(async (inspection) => ({
      inspection,
      bundle: await api<InspectionBundle>(`/api/inspections/${inspection.id}`)
    }))
  );
}
