import { useState } from "react";
import { Alert } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/Fields";
import { ActionButton, Notice, PageHeading, Screen } from "../components/Primitives";
import type { RootStackParamList } from "../navigation/types";
import type { Inspection } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Props = NativeStackScreenProps<RootStackParamList, "NewInspection">;

export function NewInspectionScreen({ navigation }: Props) {
  const { session, canMutate } = useAuth();
  const { request, refresh, online } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vin: "",
    year: String(new Date().getFullYear()),
    make: "",
    model: "",
    trim: "",
    mileage: "",
    exteriorColor: "",
    sellerSource: "Offsite inspection",
    inspectorName: session?.actor.name ?? ""
  });
  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!canMutate || !online) return;
    setSaving(true);
    setError(null);
    try {
      const created = await request<Inspection>("/api/inspections", {
        method: "POST",
        body: JSON.stringify({ ...form, year: Number(form.year), mileage: Number(form.mileage) })
      });
      await refresh();
      navigation.replace("InspectionDetail", { inspectionId: created.id });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not create inspection.";
      setError(message);
      Alert.alert("Inspection not created", message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <PageHeading title="New inspection" subtitle="Vehicle and assignment details" />
      {!online ? <Notice tone="offline" title="Connection required" message="Creating a new inspection requires an online connection. Cached assignments remain available." /> : null}
      {error ? <Notice tone="bad" title="Could not save" message={error} /> : null}
      <Field label="VIN" value={form.vin} onChangeText={update("vin")} autoCapitalize="characters" />
      <Field label="Year" value={form.year} onChangeText={update("year")} keyboardType="number-pad" />
      <Field label="Make" value={form.make} onChangeText={update("make")} />
      <Field label="Model" value={form.model} onChangeText={update("model")} />
      <Field label="Trim" value={form.trim} onChangeText={update("trim")} />
      <Field label="Odometer" value={form.mileage} onChangeText={update("mileage")} keyboardType="number-pad" />
      <Field label="Exterior color" value={form.exteriorColor} onChangeText={update("exteriorColor")} />
      <Field label="Source" value={form.sellerSource} onChangeText={update("sellerSource")} />
      <Field label="Inspector" value={form.inspectorName} onChangeText={update("inspectorName")} />
      <ActionButton label={saving ? "Creating…" : "Create inspection"} disabled={saving || !online || !canMutate} onPress={() => void save()} />
    </Screen>
  );
}
