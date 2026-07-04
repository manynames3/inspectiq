import { sampleBundles, sampleImages } from "./sampleImages.js";
import type { Actor } from "./domain.js";
import { MemoryStore } from "./store.js";

const systemActor: Actor = { id: "queue-import", name: "Queue Import", role: "admin" };

export function seedStore(store: MemoryStore): void {
  store.reset();
  const inspector = store.addUser({ id: "inspector-john-smith", name: "John Smith", role: "inspector" });
  const maria = store.addUser({ id: "inspector-maria-lee", name: "Maria Lee", role: "inspector" });
  const gateOps = store.addUser({ id: "inspector-gate-ops", name: "Gate Ops", role: "inspector" });
  store.addUser({ id: "review-lead", name: "Review Lead", role: "reviewer" });
  const inspectorActors: Record<string, Actor> = {
    "John Smith": { id: inspector.id, name: inspector.name, role: inspector.role },
    "Maria Lee": { id: maria.id, name: maria.name, role: maria.role },
    "Gate Ops": { id: gateOps.id, name: gateOps.name, role: gateOps.role }
  };

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
      sampleKeys: sampleBundles["complete-clean-set"].filter((key) => key !== "odometer-closeup-64231")
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
      sampleKeys: ["front-clean", "driver-side-scratch", "odometer-closeup-64231"]
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
      inspectorName: "Maria Lee",
      sampleKeys: ["rear-severe-damage", "front-clean", "vin-plate-4t1g11ak8mu123456"]
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
    },
    {
      vin: "5UXCR6C03L9B12345",
      year: 2020,
      make: "BMW",
      model: "X5",
      trim: "xDrive40i",
      mileage: 67844,
      exteriorColor: "Mineral White",
      sellerSource: "Seller disclosure arbitration review",
      inspectorName: "Maria Lee",
      sampleKeys: sampleBundles["arbitration-risk-set"]
    },
    {
      vin: "3GCUDDED2NG123456",
      year: 2022,
      make: "Chevrolet",
      model: "Silverado 1500",
      trim: "LT",
      mileage: 52410,
      exteriorColor: "Summit White",
      sellerSource: "Gate imaging lane",
      inspectorName: "Gate Ops",
      sampleKeys: sampleBundles["gate-imaging-partial-set"]
    },
    {
      vin: "5XYRK4LF0NG123456",
      year: 2022,
      make: "Kia",
      model: "Sorento",
      trim: "SX",
      mileage: 33291,
      exteriorColor: "Gravity Gray",
      sellerSource: "Offsite mobile capture retake",
      inspectorName: "Maria Lee",
      sampleKeys: sampleBundles["offsite-retake-set"]
    },
    {
      vin: "55SWF4KB7HU123456",
      year: 2017,
      make: "Mercedes-Benz",
      model: "C300",
      trim: "4MATIC",
      mileage: 128904,
      exteriorColor: "Obsidian Black",
      sellerSource: "Lender repossession intake",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["high-mile-repo-set"]
    },
    {
      vin: "7SAYGDEE5PF123456",
      year: 2023,
      make: "Tesla",
      model: "Model Y",
      trim: "Long Range",
      mileage: 18622,
      exteriorColor: "Pearl White",
      sellerSource: "EV fleet return",
      inspectorName: "Gate Ops",
      sampleKeys: sampleBundles["complete-clean-set"].filter((key) => key !== "engine-bay-clean")
    }
  ];

  for (const input of seeded) {
    const actor = inspectorActors[input.inspectorName] ?? inspectorActors["John Smith"];
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
        uploadedBy: actor.id,
        declaredAngle: sample.angle
      }, actor);
    }
  }

  store.addAudit([...store.inspections.values()][0].id, systemActor, "inspection.queue.loaded", {
    inspections: store.inspections.size,
    note: "Initial inspection queue loaded."
  });
}
