import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, PageHeading, Screen, StatusPill } from "../components/Primitives";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

type AuditFilter = "all" | "evidence" | "review" | "report";

export function AuditScreen() {
  const { bundles, refresh, loading } = useWorkspace();
  const [filter, setFilter] = useState<AuditFilter>("all");
  const events = useMemo(() => bundles.flatMap((bundle) => bundle.auditEvents.map((event) => ({ event, inspection: bundle.inspection })))
    .filter(({ event }) => filter === "all"
      || (filter === "evidence" && (event.eventType.includes("photo") || event.eventType.includes("image")))
      || (filter === "review" && (event.eventType.includes("suggestion") || event.eventType.includes("damage") || event.eventType.includes("grade")))
      || (filter === "report" && event.eventType.includes("report")))
    .sort((left, right) => right.event.createdAt.localeCompare(left.event.createdAt)), [bundles, filter]);
  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title="Audit trail" subtitle={`${events.length} role and workflow events`} />
      <View style={styles.filters}>
        {(["all", "evidence", "review", "report"] as const).map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)} style={[styles.filter, filter === option && styles.filterActive]} accessibilityRole="tab" accessibilityState={{ selected: filter === option }}>
            <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>{option[0].toUpperCase() + option.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.timeline}>
        {events.map(({ event, inspection }) => (
          <Card key={event.id} style={styles.event}>
            <View style={styles.marker} />
            <View style={styles.copy}>
              <View style={styles.header}>
                <Text style={styles.type}>{event.eventType.replaceAll("_", " ").replaceAll(".", " · ")}</Text>
                <StatusPill label={new Date(event.createdAt).toLocaleDateString()} />
              </View>
              <Text style={styles.vehicle}>{inspection.year} {inspection.make} {inspection.model} · {inspection.vin}</Text>
              <Text style={styles.actor}>{event.actor} · {new Date(event.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
            </View>
          </Card>
        ))}
        {events.length === 0 ? <EmptyState title="No matching audit events" message="Choose another event category." /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 6 },
  filter: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 6, backgroundColor: colors.graySoft },
  filterActive: { backgroundColor: colors.blueSoft },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  filterTextActive: { color: colors.blue },
  timeline: { gap: 10 },
  event: { flexDirection: "row", gap: 12 },
  marker: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal, marginTop: 4 },
  copy: { flex: 1, gap: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  type: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800", textTransform: "capitalize" },
  vehicle: { color: colors.muted, fontSize: 12 },
  actor: { color: colors.muted, fontSize: 11 }
});
