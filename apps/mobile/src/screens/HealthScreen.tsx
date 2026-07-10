import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotateCcw, Siren } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, Card, Metric, Notice, PageHeading, Screen, StatusPill } from "../components/Primitives";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Health = {
  runtimeProof: {
    environment: string;
    authMode: string;
    persistenceMode: string;
    postgres: string;
    imageStorage: string;
    imageAnalysisMode: string;
    visionProvider: string;
    promptVersion: string;
    queueHealth: { failedImageJobs: number; deadLetterImageJobs: number; activeImageJobs: number };
    latestSuccessfulImageAnalysis: { inspection: string; confidence: string; completedAt: string } | null;
    latestFailedOrRecoveredJob: { type: string; inspection?: string; message?: string } | null;
  };
  eventDrivenOperations: {
    bus: string;
    pendingOutboxEvents: number;
    deliveredOutboxEvents: number;
    failedOutboxEvents: number;
    recentProjectionEvents: Array<Record<string, unknown>>;
    projectionHealth: { projectedCount: number; duplicateCount: number; lastEventType: string | null; lastProjectedAt: string | null };
    eventDlq: { configured: boolean; visibleMessages: number };
  };
  costGuard: {
    month: string;
    imageAnalyses: { used: number; limit: number };
    reportDrafts: { used: number; limit: number };
  };
};

export function HealthScreen() {
  const { canMutate } = useAuth();
  const { request, online } = useWorkspace();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setHealth(await request<Health>("/api/platform-health"));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Platform Health could not be loaded.");
    }
  };
  const operation = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "Recovery action failed.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (online) void load(); }, [online]);
  return (
    <Screen refresh={() => void load()} refreshing={busy}>
      <PageHeading title="Platform Health" subtitle="Live workflow, event delivery, and recovery state" />
      {!online ? <Notice tone="offline" title="Live status unavailable" message="Platform operations require a network connection." /> : null}
      {error ? <Notice tone="bad" title="Operations request failed" message={error} /> : null}
      {health ? (
        <>
          <View style={styles.metrics}>
            <Metric label="Active image jobs" value={health.runtimeProof.queueHealth.activeImageJobs} />
            <Metric label="Failed jobs" value={health.runtimeProof.queueHealth.failedImageJobs} tone={health.runtimeProof.queueHealth.failedImageJobs ? "bad" : "good"} />
            <Metric label="Event failures" value={health.eventDrivenOperations.failedOutboxEvents} tone={health.eventDrivenOperations.failedOutboxEvents ? "bad" : "good"} />
          </View>
          <Card>
            <Text style={styles.cardTitle}>Current runtime</Text>
            <View style={styles.rows}>
              <HealthRow label="Authentication" value={health.runtimeProof.authMode} />
              <HealthRow label="Persistence" value={`${health.runtimeProof.persistenceMode} · Postgres ${health.runtimeProof.postgres}`} />
              <HealthRow label="Image path" value={health.runtimeProof.imageAnalysisMode} />
              <HealthRow label="Vision" value={`${health.runtimeProof.visionProvider} · ${health.runtimeProof.promptVersion}`} />
              <HealthRow label="Domain bus" value={health.eventDrivenOperations.bus} />
            </View>
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Monthly model guardrails · {health.costGuard.month}</Text>
            <HealthRow label="Image analyses" value={`${health.costGuard.imageAnalyses.used} / ${health.costGuard.imageAnalyses.limit}`} />
            <HealthRow label="Report drafts" value={`${health.costGuard.reportDrafts.used} / ${health.costGuard.reportDrafts.limit}`} />
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Event projection</Text>
            <View style={styles.eventRow}>
              <StatusPill label={`${health.eventDrivenOperations.deliveredOutboxEvents} delivered`} tone="good" />
              <StatusPill label={`${health.eventDrivenOperations.pendingOutboxEvents} pending`} tone={health.eventDrivenOperations.pendingOutboxEvents ? "warn" : "neutral"} />
              <StatusPill label={`${health.eventDrivenOperations.recentProjectionEvents.length} projected`} tone="info" />
              <StatusPill label={`${health.eventDrivenOperations.projectionHealth.duplicateCount} duplicates suppressed`} tone="neutral" />
              <StatusPill label={`${health.eventDrivenOperations.eventDlq.visibleMessages} in event DLQ`} tone={health.eventDrivenOperations.eventDlq.visibleMessages ? "bad" : "good"} />
            </View>
          </Card>
          <ActionButton label="Recover failed image jobs" disabled={!canMutate || busy || !online} icon={<RotateCcw size={17} color="white" />} onPress={() => void operation("/api/platform-health/recover-failed-jobs", { reason: "Admin recovery from mobile Platform Health" })} />
          <ActionButton label="Replay failed domain events" tone="secondary" disabled={!canMutate || busy || !online || health.eventDrivenOperations.failedOutboxEvents === 0} icon={<Siren size={17} color={colors.ink} />} onPress={() => void operation("/api/platform-health/replay-domain-events", {})} />
          <ActionButton label="Replay EventBridge DLQ" tone="secondary" disabled={!canMutate || busy || !online || health.eventDrivenOperations.eventDlq.visibleMessages === 0} icon={<Siren size={17} color={colors.ink} />} onPress={() => void operation("/api/platform-health/replay-domain-event-dlq", { maxMessages: 10 })} />
        </>
      ) : null}
    </Screen>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  rows: { gap: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  value: { flex: 1, color: colors.ink, fontSize: 12, textAlign: "right" },
  eventRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }
});
