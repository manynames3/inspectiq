import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, Check, Circle, FileText, Play, Sparkles } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { canRole, requiredPhotoAngles, type RequiredPhotoAngle } from "@inspectiq/shared";
import { useAuth } from "../auth/AuthContext";
import { EvidenceImage } from "../components/EvidenceImage";
import { ActionButton, Card, Notice, PageHeading, Screen, Section, StatusPill } from "../components/Primitives";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Props = NativeStackScreenProps<RootStackParamList, "InspectionDetail">;

const labels: Record<RequiredPhotoAngle, string> = {
  front: "Front",
  rear: "Rear",
  driver_side: "Driver side",
  passenger_side: "Passenger side",
  interior: "Interior",
  engine_bay: "Engine bay",
  odometer: "Odometer",
  vin_plate: "VIN plate"
};

export function InspectionDetailScreen({ route, navigation }: Props) {
  const { session, canMutate } = useAuth();
  const { bundleById, refresh, request, online, loading, pendingUploads } = useWorkspace();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bundle = bundleById(route.params.inspectionId);
  if (!session || !bundle) {
    return <Screen><Notice tone="warn" title="Inspection unavailable" message="Refresh assignments while online to cache this inspection." /></Screen>;
  }
  const { inspection } = bundle;
  const pendingForInspection = pendingUploads.filter((item) => item.inspectionId === inspection.id);
  const captured = new Set(bundle.photos.map((photo) => photo.declaredAngle));
  const pendingSuggestions = bundle.suggestions.filter((item) => item.status === "pending");
  const steps = [
    { label: "Inspection", complete: inspection.completenessPercentage === 100 },
    { label: "AI analysis", complete: bundle.photos.length > 0 && bundle.photos.every((photo) => photo.analysisStatus === "completed") },
    { label: "Human review", complete: pendingSuggestions.length === 0 && bundle.photos.length > 0 },
    { label: "Report", complete: inspection.status === "FINALIZED" }
  ];

  const runAction = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setActionError(null);
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The workflow action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title={`${inspection.year} ${inspection.make} ${inspection.model}`} subtitle={`${inspection.vin} · ${inspection.mileage.toLocaleString()} mi · ${inspection.trim}`} />
      {!online ? <Notice tone="offline" title="Cached inspection" message={`${pendingForInspection.length} local capture operation${pendingForInspection.length === 1 ? "" : "s"} will sync after reconnection.`} /> : null}
      {actionError ? <Notice tone="bad" title="Action not completed" message={actionError} /> : null}
      {bundle.readinessIssues.length > 0 ? (
        <Notice tone="warn" title="Buyer release held" message={bundle.readinessIssues.map((issue) => issue.detail).slice(0, 3).join(" · ")} />
      ) : null}
      <Section title="Workflow status">
        <Card>
          <View style={styles.steps}>
            {steps.map((step, index) => (
              <View key={step.label} style={styles.stepWrap}>
                <View style={styles.stepLineRow}>
                  {index > 0 ? <View style={[styles.line, steps[index - 1].complete && styles.lineComplete]} /> : <View style={styles.lineSpacer} />}
                  <View style={[styles.stepCircle, step.complete && styles.stepCircleComplete]}>
                    {step.complete ? <Check size={15} color="white" /> : <Text style={styles.stepNumber}>{index + 1}</Text>}
                  </View>
                  {index < steps.length - 1 ? <View style={[styles.line, step.complete && styles.lineComplete]} /> : <View style={styles.lineSpacer} />}
                </View>
                <Text style={styles.stepLabel}>{step.label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Section>
      <Section title="Required photo checklist" action={<StatusPill label={`${inspection.completenessPercentage}%`} tone={inspection.completenessPercentage === 100 ? "good" : "warn"} />}>
        <Card>
          <View style={styles.checklist}>
            {requiredPhotoAngles.map((angle) => {
              const complete = captured.has(angle) || pendingForInspection.some((operation) => operation.declaredAngle === angle && operation.status !== "blocked");
              return (
                <View key={angle} style={styles.checkRow}>
                  <View style={[styles.checkCircle, complete && styles.checkCircleComplete]}>{complete ? <Check size={13} color={colors.teal} /> : <Circle size={13} color={colors.muted} />}</View>
                  <Text style={styles.checkLabel}>{labels[angle]}</Text>
                  <Text style={[styles.checkState, complete && styles.checkStateComplete]}>{complete ? "Captured" : "Required"}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      </Section>
      {canMutate && canRole(session.actor.role, "photo:capture") && inspection.status !== "FINALIZED" ? (
        <ActionButton label="Capture required photos" icon={<Camera size={18} color="white" />} onPress={() => navigation.navigate("Capture", { inspectionId: inspection.id })} />
      ) : null}
      <Section title={`Evidence (${bundle.photos.length})`}>
        <View style={styles.photoGrid}>
          {bundle.photos.map((photo) => (
            <Card key={photo.id} style={styles.photoCard}>
              <EvidenceImage photo={photo} />
              <View style={styles.photoCopy}>
                <Text style={styles.photoLabel}>{photo.declaredAngle ? labels[photo.declaredAngle] : "Unclassified"}</Text>
                <StatusPill label={photo.analysisStatus === "completed" ? "Analyzed" : photo.qualityStatus === "fail" ? "Retake" : "Pending"} tone={photo.analysisStatus === "completed" ? "good" : photo.qualityStatus === "fail" ? "bad" : "warn"} />
              </View>
            </Card>
          ))}
        </View>
      </Section>
      <View style={styles.actions}>
        {canMutate && online && canRole(session.actor.role, "photo:analyze") && bundle.photos.length > 0 ? (
          <ActionButton label={busy ? "Submitting…" : "Analyze photos"} tone="secondary" disabled={busy} icon={<Play size={17} color={colors.ink} />} onPress={() => void runAction(`/api/inspections/${inspection.id}/photos/analyze`)} />
        ) : null}
        {canMutate && online && canRole(session.actor.role, "grade:calculate") && inspection.status === "READY_FOR_GRADING" ? (
          <ActionButton label="Calculate grade" tone="secondary" icon={<Sparkles size={17} color={colors.ink} />} onPress={() => void runAction(`/api/inspections/${inspection.id}/grade`)} />
        ) : null}
        {canRole(session.actor.role, "report:edit") || bundle.finalReport ? (
          <ActionButton label="Open condition report" tone="secondary" icon={<FileText size={17} color={colors.ink} />} onPress={() => navigation.navigate("ReportEditor", { inspectionId: inspection.id })} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", alignItems: "flex-start" },
  stepWrap: { flex: 1, alignItems: "center", gap: 7 },
  stepLineRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  stepCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "#8EA1BB", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  stepCircleComplete: { backgroundColor: colors.teal, borderColor: colors.teal },
  stepNumber: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  line: { flex: 1, height: 1, backgroundColor: "#AFC0D4" },
  lineComplete: { backgroundColor: colors.teal },
  lineSpacer: { flex: 1 },
  stepLabel: { color: colors.ink, fontSize: 10, textAlign: "center", fontWeight: "700" },
  checklist: { gap: 0 },
  checkRow: { minHeight: 40, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 9 },
  checkCircle: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkCircleComplete: { backgroundColor: colors.tealSoft },
  checkLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "700" },
  checkState: { color: colors.amber, fontSize: 11, fontWeight: "700" },
  checkStateComplete: { color: colors.teal },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoCard: { width: "48%", overflow: "hidden", padding: 0 },
  photoCopy: { padding: 10, gap: 7 },
  photoLabel: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  actions: { gap: 10 }
});
