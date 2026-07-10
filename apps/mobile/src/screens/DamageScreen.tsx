import { StyleSheet, Text, View } from "react-native";
import { estimateDamageRepairCost } from "@inspectiq/shared";
import { Card, EmptyState, Metric, PageHeading, Screen, StatusPill } from "../components/Primitives";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function DamageScreen() {
  const { bundles, refresh, loading } = useWorkspace();
  const items = bundles.flatMap((bundle) => bundle.damageItems.map((damage) => ({ damage, inspection: bundle.inspection })));
  const totals = items.reduce((sum, { damage }) => {
    const estimate = estimateDamageRepairCost(damage.damageType, damage.severity);
    return { min: sum.min + estimate.min, max: sum.max + estimate.max };
  }, { min: 0, max: 0 });
  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title="Confirmed damage" subtitle="Human-reviewed condition findings" />
      <View style={styles.metrics}>
        <Metric label="Damage items" value={items.length} />
        <Metric label="Moderate / severe" value={items.filter(({ damage }) => damage.severity === "moderate" || damage.severity === "severe").length} tone="warn" />
        <Metric label="Recon range" value={`$${totals.min.toLocaleString()}–$${totals.max.toLocaleString()}`} />
      </View>
      <View style={styles.list}>
        {items.map(({ damage, inspection }) => {
          const estimate = estimateDamageRepairCost(damage.damageType, damage.severity);
          return (
            <Card key={damage.id}>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.vehicle}>{inspection.year} {inspection.make} {inspection.model}</Text>
                  <Text style={styles.vin}>{inspection.vin}</Text>
                </View>
                <StatusPill label={damage.severity} tone={damage.severity === "severe" ? "bad" : damage.severity === "moderate" ? "warn" : "info"} />
              </View>
              <Text style={styles.title}>{damage.location} · {damage.damageType.replaceAll("_", " ")}</Text>
              <Text style={styles.notes}>{damage.notes || "No reviewer note."}</Text>
              <Text style={styles.estimate}>{estimate.label} estimated recon · {damage.source === "vision_suggestion" ? "AI-assisted, human-confirmed" : "Inspector reported"}</Text>
            </Card>
          );
        })}
        {items.length === 0 ? <EmptyState title="No confirmed damage" message="Accepted damage findings and manual condition entries will appear here." /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  list: { gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  copy: { flex: 1, gap: 2 },
  vehicle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  vin: { color: colors.muted, fontSize: 10 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800", textTransform: "capitalize", marginTop: 12 },
  notes: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 5 },
  estimate: { color: colors.teal, fontSize: 12, fontWeight: "700", marginTop: 9 }
});
