import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVpicCacheForTests, decodeVehicleReference } from "./vpicClient.js";

const vin = "1FMCU9H6XNUB81389";

afterEach(() => {
  clearVpicCacheForTests();
});

function nhtsaResponse() {
  return {
    Results: [{
      VIN: vin,
      ModelYear: "2022",
      Make: "FORD",
      Model: "Escape",
      Trim: "SEL",
      Series: "SEL",
      BodyClass: "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)",
      VehicleType: "MULTIPURPOSE PASSENGER VEHICLE (MPV)",
      DriveType: "4WD/4-Wheel Drive/4x4",
      FuelTypePrimary: "Gasoline",
      EngineCylinders: "4",
      DisplacementL: "2.0",
      Manufacturer: "FORD MOTOR COMPANY",
      PlantCity: "LOUISVILLE",
      PlantState: "KENTUCKY",
      PlantCountry: "UNITED STATES (USA)",
      ErrorCode: "0",
      ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct"
    }]
  };
}

describe("NHTSA vPIC client", () => {
  it("maps a clean VIN response into user-facing reference fields", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(nhtsaResponse()), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));

    const result = await decodeVehicleReference(vin, 2022, fetchImpl as typeof fetch);

    expect(result).toMatchObject({
      provider: "NHTSA vPIC",
      vin,
      validVin: true,
      cached: false,
      specifications: {
        modelYear: "2022",
        make: "FORD",
        model: "Escape",
        trim: "SEL",
        driveType: "4WD/4-Wheel Drive/4x4",
        engine: "2.0 L · 4-cylinder",
        plant: "LOUISVILLE, KENTUCKY, UNITED STATES (USA)"
      }
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("serves repeated decodes from the bounded in-memory cache", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(nhtsaResponse()), { status: 200 }));

    await decodeVehicleReference(vin, 2022, fetchImpl as typeof fetch);
    const cached = await decodeVehicleReference(vin, 2022, fetchImpl as typeof fetch);

    expect(cached.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects incomplete or malformed VINs before calling NHTSA", async () => {
    const fetchImpl = vi.fn();

    await expect(decodeVehicleReference("NOT-A-VIN", 2022, fetchImpl as typeof fetch))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a stable upstream error without leaking implementation details", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(decodeVehicleReference(vin, 2022, fetchImpl as typeof fetch))
      .rejects.toEqual(expect.objectContaining({
        status: 502,
        code: "UPSTREAM_UNAVAILABLE"
      }));
  });
});
