import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Search } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { EmptyState, PageHeading, Screen } from "../components/Primitives";
import { InspectionCard } from "../components/InspectionCard";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Filter = "active" | "review" | "complete" | "all";

export function QueueScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bundles, refresh, loading } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const filtered = useMemo(() => bundles.filter((bundle) => {
    const searchable = `${bundle.inspection.vin} ${bundle.inspection.year} ${bundle.inspection.make} ${bundle.inspection.model}`.toLowerCase();
    if (!searchable.includes(query.trim().toLowerCase())) return false;
    if (filter === "complete") return bundle.inspection.status === "FINALIZED";
    if (filter === "review") return bundle.inspection.status === "HUMAN_REVIEW_REQUIRED" || bundle.suggestions.some((item) => item.status === "pending");
    if (filter === "active") return bundle.inspection.status !== "FINALIZED";
    return true;
  }), [bundles, query, filter]);

  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title="Inspections" subtitle={`${filtered.length} of ${bundles.length} assigned records`} />
      <View style={styles.searchWrap}>
        <Search size={17} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search VIN or vehicle"
          placeholderTextColor="#8796AC"
          accessibilityLabel="Search inspections"
          style={styles.search}
        />
      </View>
      <View style={styles.filters} accessibilityRole="tablist">
        {(["active", "review", "complete", "all"] as const).map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)} accessibilityRole="tab" accessibilityState={{ selected: filter === option }} style={[styles.filter, filter === option && styles.filterActive]}>
            <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>{option[0].toUpperCase() + option.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.list}>
        {filtered.map((bundle) => <InspectionCard key={bundle.inspection.id} bundle={bundle} onPress={() => navigation.navigate("InspectionDetail", { inspectionId: bundle.inspection.id })} />)}
        {filtered.length === 0 ? <EmptyState title="No matching inspections" message="Change the queue filter or search term." /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { height: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 7 },
  search: { flex: 1, color: colors.ink, fontSize: 15 },
  filters: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.line },
  filter: { flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterActive: { borderBottomColor: colors.blue },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: colors.blue },
  list: { gap: 10 }
});
