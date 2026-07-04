import { sampleBundles, sampleImages } from "./sampleImages.js";
import type { Actor } from "./domain.js";
import { MemoryStore } from "./store.js";

const systemActor: Actor = { id: "queue-import", name: "Queue Import", role: "admin" };

export function seedStore(store: MemoryStore): void {
  store.reset();
  const inspector = store.addUser({ id: "inspector-john-smith", name: "John Smith", role: "inspector" });
  store.addUser({ id: "review-lead", name: "Review Lead", role: "reviewer" });
  const actor: Actor = { id: inspector.id, name: inspector.name, role: inspector.role };

  const seeded = [
    {
      vin: "4T1G11AK8MU123456",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: 64231,
      exteriorColor: "Silver",
      sellerSource: "Fleet remarketing offsite",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["complete-clean-set"]
    },
    {
      vin: "1HGCV1F34LA123456",
      year: 2020,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 79812,
      exteriorColor: "White",
      sellerSource: "Dealer trade-in lane",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["complete-clean-set"].filter((key) => key !== "odometer-64231")
    },
    {
      vin: "1FMCU9G68NU123456",
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 38125,
      exteriorColor: "Blue",
      sellerSource: "Lease return offsite",
      inspectorName: "John Smith",
      sampleKeys: ["front-clean", "driver-side-scratch", "odometer-64231"]
    },
    {
      vin: "5N1AT2MT9KC123456",
      year: 2019,
      make: "Nissan",
      model: "Rogue",
      trim: "SV",
      mileage: 102440,
      exteriorColor: "Black",
      sellerSource: "Wholesale auction lane",
      inspectorName: "Review Lead",
      sampleKeys: ["rear-severe-damage", "front-clean", "vin-plate"]
    },
    {
      vin: "4S4BTACC3P3123456",
      year: 2023,
      make: "Subaru",
      model: "Outback",
      trim: "Premium",
      mileage: 21088,
      exteriorColor: "Green",
      sellerSource: "Retail acquisition intake",
      inspectorName: "John Smith",
      sampleKeys: ["blurry-front"]
    }
  ];

  for (const input of seeded) {
    const inspection = store.createInspection(input, actor);
    for (const sampleKey of input.sampleKeys) {
      const sample = sampleImages.find((item) => item.key === sampleKey);
      if (!sample) continue;
      store.addPhoto({
        inspectionId: inspection.id,
        storageKey: `/sample-images/${sample.filename}`,
        objectBucket: "inspectiq-sample-images",
        objectKey: `sample-images/${sample.filename}`,
        thumbnailStorageKey: `/sample-images/${sample.filename}`,
        byteSize: null,
        checksumSha256: null,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: inspector.id,
        declaredAngle: sample.angle
      }, actor);
    }
  }

  store.addAudit([...store.inspections.values()][0].id, systemActor, "inspection.queue.loaded", {
    inspections: store.inspections.size,
    note: "Initial inspection queue loaded."
  });
}
