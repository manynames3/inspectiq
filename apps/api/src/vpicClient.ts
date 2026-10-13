import { ApiError, validation } from "./errors.js";

const vpicApiBase = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const cacheTtlMs = 24 * 60 * 60 * 1000;
const requestTimeoutMs = 5_000;

type VpicApiResult = {
  VIN?: unknown;
  ModelYear?: unknown;
  Make?: unknown;
  Model?: unknown;
  Trim?: unknown;
  Series?: unknown;
  BodyClass?: unknown;
  VehicleType?: unknown;
  DriveType?: unknown;
  FuelTypePrimary?: unknown;
  EngineCylinders?: unknown;
  DisplacementL?: unknown;
  Manufacturer?: unknown;
  PlantCity?: unknown;
  PlantState?: unknown;
  PlantCountry?: unknown;
  ErrorCode?: unknown;
  ErrorText?: unknown;
};

type VpicApiResponse = {
  Results?: unknown;
};

export type VehicleReference = {
  provider: "NHTSA vPIC";
  sourceUrl: string;
  retrievedAt: string;
  cached: boolean;
  vin: string;
  validVin: boolean;
  validationMessage: string;
  specifications: {
    modelYear: string | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    series: string | null;
    bodyClass: string | null;
    vehicleType: string | null;
    driveType: string | null;
    fuelType: string | null;
    engine: string | null;
    manufacturer: string | null;
    plant: string | null;
  };
};

type CacheEntry = {
  expiresAt: number;
  value: Omit<VehicleReference, "cached">;
};

const cache = new Map<string, CacheEntry>();

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.toLowerCase() !== "not applicable" ? normalized : null;
}

function engineLabel(result: VpicApiResult): string | null {
  const cylinders = text(result.EngineCylinders);
  const displacement = text(result.DisplacementL);
  const parts = [
    displacement ? `${displacement} L` : null,
    cylinders ? `${cylinders}-cylinder` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function plantLabel(result: VpicApiResult): string | null {
  const parts = [text(result.PlantCity), text(result.PlantState), text(result.PlantCountry)].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function validatedVin(vin: string): string {
  const normalized = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) {
    throw validation("NHTSA VIN decoding requires a complete 17-character VIN.", {
      vinLength: normalized.length
    });
  }
  return normalized;
}

function parseResult(payload: VpicApiResponse): VpicApiResult {
  if (!Array.isArray(payload.Results) || payload.Results.length === 0 || typeof payload.Results[0] !== "object" || payload.Results[0] === null) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "NHTSA returned an invalid VIN-decoder response.");
  }
  return payload.Results[0] as VpicApiResult;
}

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > 500) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export async function decodeVehicleReference(
  vinInput: string,
  modelYear: number,
  fetchImpl: typeof fetch = fetch
): Promise<VehicleReference> {
  const vin = validatedVin(vinInput);
  const cacheKey = `${vin}:${modelYear}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.value, cached: true };
  }

  const sourceUrl = `${vpicApiBase}/${encodeURIComponent(vin)}?format=json&modelyear=${encodeURIComponent(String(modelYear))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(sourceUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "InspectIQ/1.0 vehicle-reference"
      },
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new ApiError(502, "UPSTREAM_UNAVAILABLE", timedOut
      ? "NHTSA VIN decoding timed out. Try again."
      : "NHTSA VIN decoding is temporarily unavailable. Try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ApiError(502, "UPSTREAM_UNAVAILABLE", "NHTSA VIN decoding is temporarily unavailable. Try again.", {
      upstreamStatus: response.status
    });
  }

  let payload: VpicApiResponse;
  try {
    payload = await response.json() as VpicApiResponse;
  } catch {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "NHTSA returned an invalid VIN-decoder response.");
  }
  const result = parseResult(payload);
  const errorCode = text(result.ErrorCode);
  const validationMessage = text(result.ErrorText) ?? "NHTSA did not return a VIN validation message.";
  const validVin = errorCode === "0";
  const retrievedAt = new Date(now).toISOString();
  const value: Omit<VehicleReference, "cached"> = {
    provider: "NHTSA vPIC",
    sourceUrl,
    retrievedAt,
    vin: text(result.VIN) ?? vin,
    validVin,
    validationMessage,
    specifications: {
      modelYear: text(result.ModelYear),
      make: text(result.Make),
      model: text(result.Model),
      trim: text(result.Trim),
      series: text(result.Series),
      bodyClass: text(result.BodyClass),
      vehicleType: text(result.VehicleType),
      driveType: text(result.DriveType),
      fuelType: text(result.FuelTypePrimary),
      engine: engineLabel(result),
      manufacturer: text(result.Manufacturer),
      plant: plantLabel(result)
    }
  };

  pruneCache(now);
  cache.set(cacheKey, { expiresAt: now + cacheTtlMs, value });
  return { ...value, cached: false };
}

export function clearVpicCacheForTests(): void {
  cache.clear();
}
