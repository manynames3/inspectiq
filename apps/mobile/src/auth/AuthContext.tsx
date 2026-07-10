import { toByteArray } from "base64-js";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { mobileConfig, oidcConfigured } from "../config";
import { clearOfflineData } from "../offline/database";
import type { Actor, MobileSession } from "../types";
import { roleFromClaims, type JwtClaims } from "./claims";

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = "inspectiq.mobile.session.v1";
const evaluationActor: Actor = {
  id: "evaluation-reviewer",
  name: "Evaluation Reviewer",
  role: "reviewer"
};

type AuthContextValue = {
  session: MobileSession | null;
  restoring: boolean;
  authError: string | null;
  canMutate: boolean;
  oidcConfigured: boolean;
  signIn: () => Promise<void>;
  enterEvaluation: () => Promise<void>;
  signOut: () => Promise<void>;
  getFreshSession: () => Promise<MobileSession | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeSegment(segment: string): JwtClaims {
  const normalized = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(new TextDecoder().decode(toByteArray(padded))) as JwtClaims;
}

function sessionFromTokenResponse(response: AuthSession.TokenResponse, previousRefreshToken: string | null = null): MobileSession {
  if (!response.idToken) throw new Error("Cognito did not return an identity token.");
  const [, payload] = response.idToken.split(".");
  if (!payload) throw new Error("Cognito returned an invalid identity token.");
  const claims = decodeSegment(payload);
  return {
    mode: "oidc",
    actor: {
      id: claims.sub ?? "authenticated-user",
      name: claims.name ?? claims.email ?? claims.username ?? "Authenticated user",
      role: roleFromClaims(claims)
    },
    idToken: response.idToken,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? previousRefreshToken,
    expiresAt: claims.exp ? claims.exp * 1000 : (response.issuedAt + (response.expiresIn ?? 3600)) * 1000
  };
}

async function persistSession(session: MobileSession | null): Promise<void> {
  if (!session) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "inspectiq", path: "auth/callback" });
  const discovery = useMemo<AuthSession.DiscoveryDocument>(() => ({
    authorizationEndpoint: `${mobileConfig.cognitoDomain}/oauth2/authorize`,
    tokenEndpoint: `${mobileConfig.cognitoDomain}/oauth2/token`,
    revocationEndpoint: `${mobileConfig.cognitoDomain}/oauth2/revoke`
  }), []);
  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    clientId: mobileConfig.cognitoClientId || "not-configured",
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "email", "profile"],
    usePKCE: true
  }, discovery);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as MobileSession;
        if (parsed.mode === "evaluation" || parsed.expiresAt > Date.now()) setSession(parsed);
      })
      .catch(() => SecureStore.deleteItemAsync(SESSION_KEY))
      .finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    if (response?.type !== "success" || !request?.codeVerifier) return;
    setRestoring(true);
    AuthSession.exchangeCodeAsync({
      clientId: mobileConfig.cognitoClientId,
      code: response.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier }
    }, discovery)
      .then(async (tokenResponse) => {
        const next = sessionFromTokenResponse(tokenResponse);
        await persistSession(next);
        setSession(next);
        setAuthError(null);
      })
      .catch((error) => setAuthError(error instanceof Error ? error.message : "Cognito sign-in failed."))
      .finally(() => setRestoring(false));
  }, [response, request?.codeVerifier, redirectUri, discovery]);

  const signIn = useCallback(async () => {
    if (!oidcConfigured) {
      setAuthError("Cognito is not configured in this build. Use the Evaluation Workspace or provide EXPO_PUBLIC_COGNITO_* values.");
      return;
    }
    setAuthError(null);
    await promptAsync();
  }, [promptAsync]);

  const enterEvaluation = useCallback(async () => {
    if (!mobileConfig.evaluationEnabled) return;
    const next: MobileSession = {
      mode: "evaluation",
      actor: evaluationActor,
      idToken: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000
    };
    await persistSession(next);
    setSession(next);
    setAuthError(null);
  }, []);

  const getFreshSession = useCallback(async (): Promise<MobileSession | null> => {
    if (!session || session.mode === "evaluation" || session.expiresAt > Date.now() + 60_000) return session;
    if (!session.refreshToken || !oidcConfigured) return null;
    try {
      const refreshed = await AuthSession.refreshAsync({
        clientId: mobileConfig.cognitoClientId,
        refreshToken: session.refreshToken,
        scopes: ["openid", "email", "profile"]
      }, discovery);
      const next = sessionFromTokenResponse(refreshed, session.refreshToken);
      await persistSession(next);
      setSession(next);
      return next;
    } catch {
      await persistSession(null);
      setSession(null);
      return null;
    }
  }, [session, discovery]);

  const signOut = useCallback(async () => {
    await Promise.all([persistSession(null), clearOfflineData({ removeFiles: true })]);
    setSession(null);
    setAuthError(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      restoring,
      authError,
      canMutate: session?.mode === "oidc",
      oidcConfigured,
      signIn,
      enterEvaluation,
      signOut,
      getFreshSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing.");
  return context;
}
