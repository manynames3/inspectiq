import { api } from "../api.js";
import type { Actor, Inspection, InspectionBundle } from "../types.js";

export type InspectionReviewRecord = {
  inspection: Inspection;
  bundle: InspectionBundle;
};

export async function loadInspectionReviewRecords(actor: Actor): Promise<InspectionReviewRecord[]> {
  const inspections = await api<Inspection[]>("/api/inspections", {}, actor);
  return Promise.all(
    inspections.map(async (inspection) => ({
      inspection,
      bundle: await api<InspectionBundle>(`/api/inspections/${inspection.id}`, {}, actor)
    }))
  );
}
