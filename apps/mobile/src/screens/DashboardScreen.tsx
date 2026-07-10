import { StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { canRole } from "@inspectiq/shared";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, Metric, Notice, PageHeading, Screen, Section } from "../components/Primitives";
import { InspectionCard } from "../components/InspectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, canMutate } = useAuth();
  const { bundles, loading, online, error, pendingUploads, refresh } = useWorkspace();
  if (!session) return null;
  const pendingSuggestions = bundles.flatMap((bundle) => bundle.suggestions).filter((item) => item.status === "pending");
  const captureWork = bundles.filter((bundle) => bundle.inspection.completenessPercentage < 100 || bundle.photos.some((photo) => photo.qualityStatus === "fail"));
  const reportsInReview = bundles.filter((bundle) => bundle.finalReport && !bundle.finalReport.finalizedAt);
  const finalized = bundles.filter((bundle) => bundle.inspection.status === "FINALIZED");
  const priority = session.actor.role === "inspector"
    ? captureWork
    : session.actor.role === "reviewer"
      ? bundles.filter((bundle) => bundle.suggestions.some((item) => item.status === "pending") || bundle.finalReport?.approvalStatus === "draft")
      : bundles.filter((bundle) => bundle.inspection.status === "REPORT_FAILED" || bundle.readinessIssues.length > 0);

  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading
        title={session.actor.role === "inspector" ? "Capture queue" : session.actor.role === "reviewer" ? "Review queue" : "Operations"}
        subtitle={`${session.actor.name} · ${online ? "Online" : "Offline"}`}
      />
      {!online ? <Notice tone="offline" title="Working offline" message="Cached assignments and photo capture remain available. Changes will upload after reconnection." /> : null}
      {error ? <Notice tone="warn" title="Latest refresh failed" message={error} /> : null}
      <View style={styles.metrics}>
        {session.actor.role === "inspector" ? (
          <>
            <Metric label="Assigned" value={bundles.length} />
            <Metric label="Capture work" value={captureWork.length} tone={captureWork.length ? "warn" : "good"} />
            <Metric label="Pending uploads" value={pendingUploads.length} tone={pendingUploads.length ? "warn" : "good"} />
          </>
        ) : session.actor.role === "reviewer" ? (
          <>
            <Metric label="Findings" value={pendingSuggestions.length} tone={pendingSuggestions.length ? "warn" : "good"} />
            <Metric label="Reports" value={reportsInReview.length} />
            <Metric label="Finalized" value={finalized.length} tone="good" />
          </>
        ) : (
          <>
            <Metric label="Inspections" value={bundles.length} />
            <Metric label="Exceptions" value={priority.length} tone={priority.length ? "bad" : "good"} />
            <Metric label="Finalized" value={finalized.length} tone="good" />
          </>
        )}
      </View>
      {canMutate && canRole(session.actor.role, "inspection:create") ? (
        <ActionButton label="New inspection" icon={<Plus size={18} color="white" />} onPress={() => navigation.navigate("NewInspection")} />
      ) : null}
      <Section title="Priority work">
        {priority.slice(0, 5).map((bundle) => (
          <InspectionCard key={bundle.inspection.id} bundle={bundle} onPress={() => navigation.navigate("InspectionDetail", { inspectionId: bundle.inspection.id })} />
        ))}
        {priority.length === 0 ? <Text style={styles.clear}>No priority work is waiting.</Text> : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  clear: { paddingVertical: 24, textAlign: "center", color: "#147A55", fontWeight: "700" }
});
