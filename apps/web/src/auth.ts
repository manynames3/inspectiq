import type { Actor } from "./types.js";

type JwtClaims = Record<string, unknown> & {
  sub?: string;
  name?: string;
  email?: string;
  username?: string;
  exp?: number;
  role?: string;
  "custom:role"?: string;
  "cognito:groups"?: string[] | string;
};

export type AuthSession = {
  idToken: string;
  accessToken: string | null;
  expiresAt: number;
  actor: Actor;
  mode: "oidc" | "local" | "evaluation";
};

const storageKey = "inspectiq.auth.session";
const localStorageKey = "inspectiq.local.session";
const verifierKey = "inspectiq.auth.pkce.verifier";
const stateKey = "inspectiq.auth.pkce.state";
const roles = ["inspector", "reviewer", "recon_coordinator", "consignor_approver", "technician", "admin"] as const;
const directRoleClaimKeys = [
  "custom:role",
  "custom:inspectiq_role",
  "inspectiq:role",
  "https://inspectiq.app/role",
  "role"
] as const;
const groupRoleClaimKeys = ["cognito:groups", "groups", "roles"] as const;

const localProfiles: Record<Actor["role"], Pick<Actor, "id" | "name" | "role">> = {
  inspector: { id: "inspector-john-smith", name: "John Smith", role: "inspector" },
  reviewer: { id: "review-lead", name: "Review Lead", role: "reviewer" },
  recon_coordinator: { id: "recon-coordinator", name: "Alex Rivera", role: "recon_coordinator" },
  consignor_approver: { id: "consignor-approver-sdg", name: "Morgan Ellis", role: "consignor_approver" },
  technician: { id: "technician-body-01", name: "Sam Patel", role: "technician" },
  admin: { id: "admin-operator", name: "Admin Operator", role: "admin" }
};

const evaluationProfiles: Record<Actor["role"], Pick<Actor, "id" | "name" | "role">> = {
  inspector: { id: "evaluation-inspector", name: "John Smith", role: "inspector" },
  reviewer: { id: "evaluation-reviewer", name: "Evaluation Reviewer", role: "reviewer" },
  recon_coordinator: { id: "evaluation-recon_coordinator", name: "Evaluation Recon Coordinator", role: "recon_coordinator" },
  consignor_approver: { id: "evaluation-consignor_approver", name: "Evaluation Consignor Approver", role: "consignor_approver" },
  technician: { id: "evaluation-technician", name: "Evaluation Technician", role: "technician" },
  admin: { id: "evaluation-admin", name: "Evaluation Admin", role: "admin" }
};

function authDomain(): string {
  return String(import.meta.env.VITE_COGNITO_DOMAIN ?? "").replace(/\/+$/, "");
}

function clientId(): string {
  return String(import.meta.env.VITE_COGNITO_CLIENT_ID ?? "");
}

function redirectUri(): string {
  return String(import.meta.env.VITE_COGNITO_REDIRECT_URI ?? window.location.origin);
}

function logoutUri(): string {
  return String(import.meta.env.VITE_COGNITO_LOGOUT_URI ?? window.location.origin);
}

export function oidcEnabled(): boolean {
  return import.meta.env.VITE_AUTH_MODE === "oidc" && Boolean(authDomain() && clientId());
}

export function evaluationModeEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_EVALUATION_MODE ?? "true").toLowerCase() !== "false";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function decodeJwt(token: string): JwtClaims {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Identity token is not a valid JWT.");
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as JwtClaims;
}

function roleFromString(value: unknown): Actor["role"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (roles.includes(normalized as Actor["role"])) return normalized as Actor["role"];

  const compact = normalized.replace(/[^a-z]/g, "");
  const withoutProductPrefix = compact.startsWith("inspectiq") ? compact.slice("inspectiq".length) : compact;
  return roles.find((role) => withoutProductPrefix === role.replace(/[^a-z]/g, "")) ?? null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function defaultAuthRole(): Actor["role"] {
  return roleFromString(String(import.meta.env.VITE_DEFAULT_AUTH_ROLE ?? "inspector")) ?? "inspector";
}

function roleFromClaims(claims: JwtClaims): Actor["role"] {
  for (const key of directRoleClaimKeys) {
    const parsed = roleFromString(claims[key]);
    if (parsed) return parsed;
  }

  for (const key of groupRoleClaimKeys) {
    for (const candidate of stringList(claims[key])) {
      const parsed = roleFromString(candidate);
      if (parsed) return parsed;
    }
  }

  return defaultAuthRole();
}

function sessionFromTokens(tokens: { id_token?: string; access_token?: string; expires_in?: number }): AuthSession {
  if (!tokens.id_token) throw new Error("Cognito did not return an identity token.");
  const claims = decodeJwt(tokens.id_token);
  const expiresAt = claims.exp ? claims.exp * 1000 : Date.now() + (tokens.expires_in ?? 3600) * 1000;
  return {
    idToken: tokens.id_token,
    accessToken: tokens.access_token ?? null,
    expiresAt,
    actor: {
      id: claims.sub ?? "authenticated-user",
      name: claims.name ?? claims.email ?? claims.username ?? "Authenticated user",
      role: roleFromClaims(claims)
    },
    mode: "oidc"
  };
}

function normalizeSession(session: AuthSession, fallbackMode: AuthSession["mode"]): AuthSession {
  return {
    ...session,
    mode: session.mode ?? fallbackMode
  };
}

export function storedAuthSession(): AuthSession | null {
  if (!oidcEnabled()) return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const session = normalizeSession(JSON.parse(raw) as AuthSession, "oidc");
    if (session.expiresAt <= Date.now() + 60_000) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

export function storedLocalSession(): AuthSession | null {
  const raw = localStorage.getItem(localStorageKey);
  if (!raw) return null;
  try {
    const session = normalizeSession(JSON.parse(raw) as AuthSession, "local");
    if (session.expiresAt <= Date.now() + 60_000) {
      localStorage.removeItem(localStorageKey);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(localStorageKey);
    return null;
  }
}

export function startLocalSession(role: Actor["role"]): AuthSession {
  const actor = localProfiles[role];
  const session: AuthSession = {
    idToken: `local-session-${crypto.randomUUID()}`,
    accessToken: null,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    actor,
    mode: "local"
  };
  localStorage.setItem(localStorageKey, JSON.stringify(session));
  return session;
}

export function startEvaluationSession(role: Actor["role"] = "reviewer"): AuthSession {
  const actor = evaluationProfiles[role];
  const session: AuthSession = {
    idToken: `evaluation-session-${crypto.randomUUID()}`,
    accessToken: null,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    actor,
    mode: "evaluation"
  };
  localStorage.setItem(localStorageKey, JSON.stringify(session));
  return session;
}

export function clearLocalSession(): void {
  localStorage.removeItem(localStorageKey);
}

export function isEvaluationSession(session: AuthSession | null): boolean {
  return session?.mode === "evaluation";
}

export async function beginLogin(): Promise<void> {
  const verifier = randomVerifier();
  const state = randomVerifier();
  sessionStorage.setItem(verifierKey, verifier);
  sessionStorage.setItem(stateKey, state);
  const params = new URLSearchParams({
    client_id: clientId(),
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state
  });
  window.location.assign(`${authDomain()}/oauth2/authorize?${params.toString()}`);
}

export async function completeLoginFromCallback(): Promise<AuthSession | null> {
  if (!oidcEnabled()) return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return storedAuthSession();

  const returnedState = url.searchParams.get("state");
  const expectedState = sessionStorage.getItem(stateKey);
  const verifier = sessionStorage.getItem(verifierKey);
  sessionStorage.removeItem(stateKey);
  sessionStorage.removeItem(verifierKey);

  if (!verifier || !expectedState || returnedState !== expectedState) {
    throw new Error("Sign-in state did not match. Start sign-in again.");
  }

  const body = new URLSearchParams({
    client_id: clientId(),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri()
  });
  const response = await fetch(`${authDomain()}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("Could not exchange Cognito authorization code.");

  const session = sessionFromTokens(await response.json() as { id_token?: string; access_token?: string; expires_in?: number });
  localStorage.setItem(storageKey, JSON.stringify(session));
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return session;
}

export function signOut(): void {
  localStorage.removeItem(storageKey);
  localStorage.removeItem(localStorageKey);
  if (!oidcEnabled()) return;
  const params = new URLSearchParams({
    client_id: clientId(),
    logout_uri: logoutUri()
  });
  window.location.assign(`${authDomain()}/logout?${params.toString()}`);
}

export function authHeaders(): Record<string, string> {
  const session = storedAuthSession();
  if (session) return { authorization: `Bearer ${session.idToken}` };
  return isEvaluationSession(storedLocalSession()) ? { "x-evaluation-mode": "true" } : {};
}

export function evaluationApiPath(path: string): string {
  if (!isEvaluationSession(storedLocalSession())) return path;
  if (!path.startsWith("/api/") || path.startsWith("/api/evaluation/")) return path;
  return path.replace(/^\/api\//, "/api/evaluation/");
}
