import type { UserRole } from "@inspectiq/shared";

export type JwtClaims = Record<string, unknown> & {
  sub?: string;
  name?: string;
  email?: string;
  username?: string;
  exp?: number;
};

function roleFromString(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().toLowerCase().replace(/[^a-z]/g, "").replace(/^inspectiq/, "");
  return compact === "admin" || compact === "reviewer" || compact === "inspector" ? compact : null;
}

export function roleFromClaims(claims: JwtClaims): UserRole {
  const directKeys = ["custom:role", "custom:inspectiq_role", "inspectiq:role", "https://inspectiq.app/role", "role"];
  for (const key of directKeys) {
    const parsed = roleFromString(claims[key]);
    if (parsed) return parsed;
  }
  const groups = claims["cognito:groups"] ?? claims.groups ?? claims.roles;
  for (const value of Array.isArray(groups) ? groups : [groups]) {
    const parsed = roleFromString(value);
    if (parsed) return parsed;
  }
  return "inspector";
}
