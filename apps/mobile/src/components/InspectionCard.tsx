import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { InspectionBundle } from "../types";
import { colors } from "../theme";
import { Card, StatusPill } from "./Primitives";

function statusPresentation(status: string): { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad" } {
  if (status === "FINALIZED") return { label: "Finalized", tone: "good" };
  if (status === "REPORT_FAILED") return { label: "Report failed", tone: "bad" };
  if (status === "HUMAN_REVIEW_REQUIRED") return { label: "Human review", tone: "warn" };
  if (status === "READY_FOR_GRADING") return { label: "Grade ready", tone: "info" };
  if (status === "GRADED" || status === "AI_DRAFTED") return { label: "Report work", tone: "info" };
  return { label: "Capture", tone: "neutral" };
}

export function InspectionCard({ bundle, onPress }: { bundle: InspectionBundle; onPress: () => void }) {
  const presentation = statusPresentation(bundle.inspection.status);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${bundle.inspection.year} ${bundle.inspection.make} ${bundle.inspection.model}`}>
      <Card style={styles.card}>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</Text>
            <StatusPill label={presentation.label} tone={presentation.tone} />
          </View>
          <Text style={styles.vin}>{bundle.inspection.vin}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detail}>{bundle.inspection.trim} · {bundle.inspection.mileage.toLocaleString()} mi</Text>
            <Text style={styles.detail}>{bundle.inspection.completenessPercentage}% evidence</Text>
          </View>
          {bundle.readinessIssues.length > 0 ? (
            <Text style={styles.blocker} numberOfLines={1}>{bundle.readinessIssues.length} release blocker{bundle.readinessIssues.length === 1 ? "" : "s"}</Text>
          ) : (
            <Text style={styles.ready}>{bundle.buyerVisibleReady ? "Buyer-visible" : "No open readiness issue"}</Text>
          )}
        </View>
        <ChevronRight size={20} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 10 },
  body: { flex: 1, gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: "800" },
  vin: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  detail: { color: colors.muted, fontSize: 12 },
  blocker: { color: colors.amber, fontSize: 12, fontWeight: "700" },
  ready: { color: colors.green, fontSize: 12, fontWeight: "700" }
});
