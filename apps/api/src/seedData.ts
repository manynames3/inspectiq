import { sampleBundles, sampleImages } from "./sampleImages.js";
import type { Actor } from "./domain.js";
import { MemoryStore } from "./store.js";

const systemActor: Actor = { id: "seed-system", name: "Seed System", role: "admin" };

export function seedStore(store: MemoryStore): void {
  store.reset();
  const inspector = store.addUser({ id: "demo-inspector", name: "Demo Inspector", role: "inspector" });
  store.addUser({ id: "demo-reviewer", name: "Review Lead", role: "reviewer" });
  const actor: Actor = { id: inspector.id, name: inspector.name, role: inspector.role };

  const seeded = [
    {
      vin: "SYNTHVIN21IQ0001",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: 64231,
      exteriorColor: "Silver",
      sellerSource: "Fleet remarketing",
      inspectorName: "Demo Inspector",
      sampleKeys: sampleBundles["complete-clean-set"]
    },
    {
      vin: "SYNTHVIN20IQ0002",
      year: 2020,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 79812,
      exteriorColor: "White",
      sellerSource: "Dealer trade",
      inspectorName: "Demo Inspector",
      sampleKeys: sampleBundles["complete-clean-set"].filter((key) => key !== "odometer-64231")
    },
    {
      vin: "SYNTHVIN22IQ0003",
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 38125,
      exteriorColor: "Blue",
      sellerSource: "Lease return",
      inspectorName: "Demo Inspector",
      sampleKeys: ["front-clean", "driver-side-scratch", "odometer-64231"]
    },
    {
      vin: "SYNTHVIN19IQ0004",
      year: 2019,
      make: "Nissan",
      model: "Rogue",
      trim: "SV",
      mileage: 102440,
      exteriorColor: "Black",
      sellerSource: "Auction lane",
      inspectorName: "Review Lead",
      sampleKeys: ["rear-severe-damage", "front-clean", "vin-plate"]
    },
    {
      vin: "SYNTHVIN23IQ0005",
      year: 2023,
      make: "Subaru",
      model: "Outback",
      trim: "Premium",
      mileage: 21088,
      exteriorColor: "Green",
      sellerSource: "Retail acquisition",
      inspectorName: "Demo Inspector",
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
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: inspector.id,
        declaredAngle: null
      }, actor);
    }
  }

  store.addAudit([...store.inspections.values()][0].id, systemActor, "seed.loaded", {
    inspections: store.inspections.size,
    note: "Seed data intentionally uses synthetic vehicles and generated placeholders."
  });
}

