import NetInfo from "@react-native-community/netinfo";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { mobileApi } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  bootstrapCursor,
  cacheBootstrap,
  cachedInspectionBundles,
  uploadOperations
} from "../offline/database";
import { syncUploadQueue, type SyncSummary } from "../offline/sync";
import type { InspectionBundle, MobileBootstrap, UploadOperation } from "../types";

type WorkspaceContextValue = {
  bundles: InspectionBundle[];
  loading: boolean;
  online: boolean;
  error: string | null;
  pendingUploads: UploadOperation[];
  lastSync: SyncSummary | null;
  refresh: () => Promise<void>;
  syncNow: () => Promise<SyncSummary | null>;
  request: <T>(path: string, options?: RequestInit & { idempotencyKey?: string }) => Promise<T>;
  bundleById: (inspectionId: string) => InspectionBundle | null;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, getFreshSession, canMutate } = useAuth();
  const [bundles, setBundles] = useState<InspectionBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<UploadOperation[]>([]);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);

  const loadLocal = useCallback(async () => {
    const [cached, operations] = await Promise.all([cachedInspectionBundles(), uploadOperations()]);
    setBundles(cached);
    setPendingUploads(operations);
  }, []);

  const request = useCallback(async <T,>(path: string, options: RequestInit & { idempotencyKey?: string } = {}): Promise<T> => {
    const current = await getFreshSession();
    if (!current) throw new Error("Your session has expired. Sign in again.");
    return mobileApi<T>(path, current, options);
  }, [getFreshSession]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await loadLocal();
      const network = await NetInfo.fetch();
      const connected = Boolean(network.isConnected && network.isInternetReachable !== false);
      setOnline(connected);
      if (!connected) {
        setError(null);
        return;
      }
      const cursor = await bootstrapCursor();
      const bootstrap = await request<MobileBootstrap>(`/api/mobile/bootstrap${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      await cacheBootstrap(bootstrap);
      await loadLocal();
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh the mobile workspace.");
      await loadLocal();
    } finally {
      setLoading(false);
    }
  }, [session?.actor.id, request, loadLocal]);

  const syncNow = useCallback(async (): Promise<SyncSummary | null> => {
    const current = await getFreshSession();
    if (!current || !canMutate) return null;
    const summary = await syncUploadQueue(current);
    setLastSync(summary);
    await refresh();
    return summary;
  }, [getFreshSession, canMutate, refresh]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(connected);
      if (connected && canMutate) void syncNow();
    });
    return unsubscribe;
  }, [session?.actor.id]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    bundles,
    loading,
    online,
    error,
    pendingUploads,
    lastSync,
    refresh,
    syncNow,
    request,
    bundleById: (inspectionId) => bundles.find((bundle) => bundle.inspection.id === inspectionId) ?? null
  }), [bundles, loading, online, error, pendingUploads, lastSync, refresh, syncNow, request]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is missing.");
  return context;
}
