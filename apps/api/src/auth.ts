import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import type { Request } from "express";
import { UserRoleSchema } from "@inspectiq/shared";
import { unauthorized } from "./errors.js";
import type { Actor } from "./domain.js";

type JsonWebKeySet = {
  keys: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }>;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  client_id?: string;
  exp?: number;
  nbf?: number;
  name?: string;
  email?: string;
  username?: string;
  role?: string;
  "custom:role"?: string;
  "cognito:groups"?: string[] | string;
};

let cachedJwks: JsonWebKeySet | null = null;

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function parseJsonSegment<T>(segment: string): T {
  return JSON.parse(decodeBase64Url(segment).toString("utf8")) as T;
}

function roleFromPayload(payload: JwtPayload): Actor["role"] {
  const directRole = UserRoleSchema.safeParse(payload["custom:role"] ?? payload.role);
  if (directRole.success) return directRole.data;

  const groups = Array.isArray(payload["cognito:groups"])
    ? payload["cognito:groups"]
    : typeof payload["cognito:groups"] === "string"
      ? [payload["cognito:groups"]]
      : [];
  for (const group of groups.map((item) => item.toLowerCase())) {
    const parsed = UserRoleSchema.safeParse(group);
    if (parsed.success) return parsed.data;
  }

  throw unauthorized("JWT is missing an InspectIQ role claim.", {
    expectedClaims: ["custom:role", "role", "cognito:groups"]
  });
}

function validateRegisteredClaims(payload: JwtPayload): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.sub) throw unauthorized("JWT is missing subject.");
  if (payload.exp && payload.exp <= nowSeconds) throw unauthorized("JWT is expired.");
  if (payload.nbf && payload.nbf > nowSeconds) throw unauthorized("JWT is not active yet.");

  const issuer = process.env.OIDC_ISSUER;
  if (issuer && payload.iss !== issuer) {
    throw unauthorized("JWT issuer mismatch.", { expectedIssuer: issuer });
  }

  const audience = process.env.OIDC_AUDIENCE;
  if (audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const clientIds = payload.client_id ? [payload.client_id] : [];
    if (![...audiences, ...clientIds].includes(audience)) {
      throw unauthorized("JWT audience mismatch.", { expectedAudience: audience });
    }
  }
}

async function jwks(): Promise<JsonWebKeySet> {
  if (cachedJwks) return cachedJwks;
  if (process.env.OIDC_JWKS_JSON) {
    cachedJwks = JSON.parse(process.env.OIDC_JWKS_JSON) as JsonWebKeySet;
    return cachedJwks;
  }

  const jwksUri = process.env.OIDC_JWKS_URI
    ?? (process.env.OIDC_ISSUER ? `${process.env.OIDC_ISSUER}/.well-known/jwks.json` : null);
  if (!jwksUri) {
    throw unauthorized("JWT mode requires OIDC_JWKS_JSON, OIDC_JWKS_URI, or OIDC_ISSUER.");
  }

  const response = await fetch(jwksUri);
  if (!response.ok) throw unauthorized("Unable to fetch OIDC JWKS.", { status: response.status });
  cachedJwks = await response.json() as JsonWebKeySet;
  return cachedJwks;
}

async function verifyJwt(token: string): Promise<JwtPayload> {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) throw unauthorized("Bearer token is not a valid JWT.");

  const header = parseJsonSegment<JwtHeader>(encodedHeader);
  if (header.alg !== "RS256") throw unauthorized("JWT must use RS256.", { alg: header.alg });

  const keySet = await jwks();
  const key = keySet.keys.find((candidate) => candidate.kid === header.kid) ?? keySet.keys[0];
  if (!key) throw unauthorized("No signing key available for JWT.");

  const publicKey = createPublicKey({ key: key as unknown as JsonWebKey, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const valid = verifier.verify(publicKey, decodeBase64Url(signature));
  if (!valid) throw unauthorized("JWT signature verification failed.");

  const payload = parseJsonSegment<JwtPayload>(encodedPayload);
  validateRegisteredClaims(payload);
  return payload;
}

export function authMode(): "headers" | "jwt" {
  return process.env.AUTH_MODE === "jwt" ? "jwt" : "headers";
}

export async function authenticateRequest(req: Request): Promise<Actor | null> {
  if (authMode() !== "jwt") return null;
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw unauthorized("Bearer token is required.");

  const payload = await verifyJwt(match[1]);
  return {
    id: payload.sub ?? "unknown-subject",
    name: payload.name ?? payload.email ?? payload.username ?? payload.sub ?? "Authenticated user",
    role: roleFromPayload(payload)
  };
}

export function clearAuthCacheForTests(): void {
  cachedJwks = null;
}
