import { StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Metric, PageHeading, Screen, StatusPill } from "../components/Primitives";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { Pressable } from "react-native";

export function ReportsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bundles, refresh, loading } = useWorkspace();
  const created = bundles.filter((bundle) => bundle.finalReport);
  const finalized = created.filter((bundle) => bundle.finalReport?.finalizedAt);
  const approval = created.filter((bundle) => bundle.finalReport?.approvalStatus === "approved");
  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title="Condition reports" subtitle="Review, approval, and buyer release" />
      <View style={styles.metrics}>
        <Metric label="Created" value={created.length} />
        <Metric label="Awaiting approval" value={created.length - finalized.length - approval.length} tone="warn" />
        <Metric label="Finalized" value={finalized.length} tone="good" />
      </View>
      <View style={styles.list}>
        {bundles.map((bundle) => {
          const status = bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? bundle.finalReport.approvalStatus.replaceAll("_", " ") : "Not started";
          return (
            <Pressable key={bundle.inspection.id} onPress={() => navigation.navigate("ReportEditor", { inspectionId: bundle.inspection.id })} accessibilityRole="button">
              <Card style={styles.card}>
                <View style={styles.copy}>
                  <Text style={styles.vehicle}>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</Text>
                  <Text style={styles.vin}>{bundle.inspection.vin}</Text>
                  <Text style={styles.summary}>{bundle.conditionGrade ? `Grade ${bundle.conditionGrade.grade} · ${bundle.conditionGrade.score}/100` : "Condition grade pending"}</Text>
                </View>
                <View style={styles.right}>
                  <StatusPill label={status} tone={bundle.finalReport?.finalizedAt ? "good" : bundle.finalReport ? "info" : "neutral"} />
                  <ChevronRight size={18} color={colors.muted} />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  list: { gap: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 10 },
  copy: { flex: 1, gap: 4 },
  vehicle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  vin: { color: colors.muted, fontSize: 10 },
  summary: { color: colors.muted, fontSize: 12 },
  right: { alignItems: "flex-end", gap: 12 }
});
