import type { Actor } from "./types.js";

type JwtClaims = {
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
  idToken: string | null;
  accessToken: string | null;
  expiresAt: number;
  actor: Actor;
  mode: "oidc" | "evaluation";
};

const storageKey = "inspectiq.auth.session";
const evaluationStorageKey = "inspectiq.auth.evaluation";
const verifierKey = "inspectiq.auth.pkce.verifier";
const stateKey = "inspectiq.auth.pkce.state";
const roles = ["admin", "reviewer", "inspector"] as const;

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

function roleFromClaims(claims: JwtClaims): Actor["role"] {
  const directRole = claims["custom:role"] ?? claims.role;
  if (directRole === "admin" || directRole === "reviewer" || directRole === "inspector") return directRole;

  const groups = Array.isArray(claims["cognito:groups"])
    ? claims["cognito:groups"]
    : typeof claims["cognito:groups"] === "string"
      ? [claims["cognito:groups"]]
      : [];
  const normalizedGroups = groups.map((group) => group.toLowerCase());
  return roles.find((role) => normalizedGroups.includes(role)) ?? "inspector";
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

export function evaluationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EVALUATION_MODE !== "false";
}

export function beginEvaluationPreview(): AuthSession {
  const session: AuthSession = {
    idToken: null,
    accessToken: null,
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
    actor: {
      id: "evaluation-reviewer",
      name: "Evaluation Reviewer",
      role: "reviewer"
    },
    mode: "evaluation"
  };
  localStorage.setItem(evaluationStorageKey, JSON.stringify(session));
  localStorage.removeItem(storageKey);
  return session;
}

export function storedAuthSession(): AuthSession | null {
  const evaluationRaw = localStorage.getItem(evaluationStorageKey);
  if (evaluationRaw && evaluationEnabled()) {
    try {
      const session = JSON.parse(evaluationRaw) as AuthSession;
      if (session.expiresAt > Date.now() + 60_000 && session.mode === "evaluation") return session;
    } catch {
      // Clear malformed evaluation state below.
    }
    localStorage.removeItem(evaluationStorageKey);
  }
  if (!oidcEnabled()) return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
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

export function isEvaluationSession(): boolean {
  return storedAuthSession()?.mode === "evaluation";
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
  localStorage.removeItem(evaluationStorageKey);
  if (!oidcEnabled()) return;
  const params = new URLSearchParams({
    client_id: clientId(),
    logout_uri: logoutUri()
  });
  window.location.assign(`${authDomain()}/logout?${params.toString()}`);
}

export function authHeaders(): Record<string, string> {
  const session = storedAuthSession();
  if (!session) return {};
  if (session.mode === "evaluation") return { "x-inspectiq-evaluation-mode": "readonly" };
  return session.idToken ? { authorization: `Bearer ${session.idToken}` } : {};
}
