import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Pencil, RotateCcw, UserCheck, X } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/Fields";
import { ActionButton, Card, EmptyState, Notice, PageHeading, Screen, StatusPill } from "../components/Primitives";
import { colors } from "../theme";
import { suggestionUsesReferenceMapping } from "../provenance";
import type { InspectionBundle, VisionSuggestion } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

type QueueItem = { bundle: InspectionBundle; suggestion: VisionSuggestion };

function findingLabel(type: VisionSuggestion["suggestionType"]): string {
  return type === "damage_candidate" ? "Damage candidate" : type === "quality_warning" ? "Image quality" : type === "extracted_text" ? "Identity cross-check" : "Required angle";
}

function evidenceText(suggestion: VisionSuggestion, referenceMapping = false): string {
  const value = suggestion.suggestedValueJson;
  if (suggestion.suggestionType === "damage_candidate") {
    const estimate = value.repairEstimateUsd as { min?: number; max?: number } | undefined;
    return `${String(value.location ?? "Vehicle")} · ${String(value.damageType ?? "damage").replaceAll("_", " ")} · ${String(value.severityEstimate ?? "review")} · ${estimate ? `$${estimate.min ?? 0}–$${estimate.max ?? 0}` : "Estimate pending"}`;
  }
  if (suggestion.suggestionType === "extracted_text") return value.vin ? `VIN ${String(value.vin)}` : `Odometer ${String(value.odometer ?? "unreadable")}`;
  if (suggestion.suggestionType === "photo_angle") return `${referenceMapping ? "Required view" : "Detected"} ${String(value.photoAngle ?? "unknown").replaceAll("_", " ")}`;
  return String(value.warning ?? suggestion.explanation);
}

function slaTone(dueAt: string | null): "neutral" | "warn" | "bad" {
  if (!dueAt) return "neutral";
  const remaining = Date.parse(dueAt) - Date.now();
  if (remaining <= 0) return "bad";
  return remaining <= 30 * 60_000 ? "warn" : "neutral";
}

export function ReviewScreen() {
  const { session, canMutate } = useAuth();
  const { bundles, refresh, request, online, loading } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = useMemo<QueueItem[]>(() => bundles.flatMap((bundle) => bundle.suggestions
    .filter((suggestion) => suggestion.status === "pending")
    .map((suggestion) => ({ bundle, suggestion })))
    .sort((left, right) => (left.suggestion.dueAt ?? "9999").localeCompare(right.suggestion.dueAt ?? "9999")), [bundles]);

  const mutate = async (suggestion: VisionSuggestion, action: "accept" | "reject") => {
    setBusyId(suggestion.id);
    setError(null);
    try {
      await request(`/api/vision-suggestions/${suggestion.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: suggestion.version })
      });
      await refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The review decision failed.");
    } finally {
      setBusyId(null);
    }
  };

  const assignSelected = async () => {
    if (!session || selected.size === 0) return;
    setError(null);
    try {
      await request("/api/vision-suggestions/bulk-assignment", {
        method: "POST",
        body: JSON.stringify({
          suggestionIds: [...selected],
          assignedToRole: session.actor.role === "inspector" ? "inspector" : "reviewer",
          assignedToUserId: session.actor.id
        })
      });
      setSelected(new Set());
      await refresh();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "Assignment failed.");
    }
  };

  const requestRetakes = async () => {
    const retakeIds = items.filter(({ suggestion }) => selected.has(suggestion.id) && (suggestion.suggestionType === "quality_warning" || suggestion.suggestionType === "photo_angle")).map(({ suggestion }) => suggestion.id);
    if (!retakeIds.length) {
      setError("Select image quality or angle findings. Damage and identity facts require individual decisions.");
      return;
    }
    try {
      await request("/api/vision-suggestions/bulk-retake", {
        method: "POST",
        body: JSON.stringify({ suggestionIds: retakeIds, reason: "Required evidence does not meet capture standards." })
      });
      setSelected(new Set());
      await refresh();
    } catch (retakeError) {
      setError(retakeError instanceof Error ? retakeError.message : "Retake request failed.");
    }
  };

  const openEdit = (item: QueueItem) => {
    setEditItem(item);
    const value = item.suggestion.suggestedValueJson;
    setEditText(String(value.vin ?? value.odometer ?? value.photoAngle ?? value.warning ?? value.location ?? ""));
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const suggestion = editItem.suggestion;
    const current = suggestion.suggestedValueJson;
    const suggestedValue = suggestion.suggestionType === "extracted_text"
      ? (current.vin ? { ...current, vin: editText.trim() } : { ...current, odometer: editText.trim() })
      : suggestion.suggestionType === "photo_angle"
        ? { ...current, photoAngle: editText.trim().toLowerCase().replaceAll(" ", "_") }
        : suggestion.suggestionType === "quality_warning"
          ? { ...current, warning: editText.trim() }
          : { ...current, location: editText.trim() };
    try {
      await request(`/api/vision-suggestions/${suggestion.id}`, {
        method: "PATCH",
        body: JSON.stringify({ suggestedValue, explanation: suggestion.explanation, expectedVersion: suggestion.version })
      });
      setEditItem(null);
      await refresh();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Finding update failed.");
    }
  };

  return (
    <Screen refresh={() => void refresh()} refreshing={loading}>
      <PageHeading title="Review queue" subtitle={`${items.length} findings need a decision`} />
      {!online ? <Notice tone="offline" title="Review paused" message="Reviewer and admin decisions require a live connection." /> : null}
      {error ? <Notice tone="bad" title="Review action not completed" message={error} /> : null}
      {selected.size > 0 ? (
        <Card>
          <Text style={styles.selection}>{selected.size} selected</Text>
          <View style={styles.bulkActions}>
            <ActionButton label="Assign to me" tone="secondary" icon={<UserCheck size={16} color={colors.ink} />} onPress={() => void assignSelected()} />
            <ActionButton label="Request retake" tone="secondary" icon={<RotateCcw size={16} color={colors.ink} />} onPress={() => void requestRetakes()} />
          </View>
        </Card>
      ) : null}
      <View style={styles.list}>
        {items.map((item) => {
          const { suggestion, bundle } = item;
          const checked = selected.has(suggestion.id);
          const referenceMapping = suggestionUsesReferenceMapping(bundle, suggestion);
          const canDecide = canMutate && online && (session?.actor.role === "reviewer" || session?.actor.role === "admin");
          return (
            <Card key={suggestion.id}>
              <View style={styles.header}>
                <Pressable onPress={() => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(suggestion.id)) next.delete(suggestion.id); else next.add(suggestion.id);
                  return next;
                })} accessibilityRole="checkbox" accessibilityState={{ checked }} style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked ? <Check size={14} color="white" /> : null}
                </Pressable>
                <View style={styles.headingCopy}>
                  <Text style={styles.vehicle}>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</Text>
                  <Text style={styles.vin}>{bundle.inspection.vin}</Text>
                </View>
                <StatusPill label={suggestion.dueAt && Date.parse(suggestion.dueAt) <= Date.now() ? "Overdue" : "SLA active"} tone={slaTone(suggestion.dueAt)} />
              </View>
              <View style={styles.finding}>
                <Text style={styles.findingLabel}>{findingLabel(suggestion.suggestionType)}</Text>
                <Text style={styles.evidence}>{evidenceText(suggestion, referenceMapping)}</Text>
                <Text style={styles.explanation}>{suggestion.explanation}</Text>
                <Text style={styles.confidence}>{referenceMapping ? "Required-view mapping" : `${Math.round(suggestion.confidence * 100)}% confidence`} · version {suggestion.version}</Text>
              </View>
              <View style={styles.actions}>
                <ActionButton label="Edit" tone="secondary" disabled={!canDecide} icon={<Pencil size={15} color={colors.ink} />} onPress={() => openEdit(item)} />
                <ActionButton label="Reject" tone="danger" disabled={!canDecide || busyId === suggestion.id} icon={<X size={15} color={colors.red} />} onPress={() => void mutate(suggestion, "reject")} />
                <ActionButton label="Accept" disabled={!canDecide || busyId === suggestion.id} icon={<Check size={15} color="white" />} onPress={() => void mutate(suggestion, "accept")} />
              </View>
            </Card>
          );
        })}
        {items.length === 0 ? <EmptyState title="Review queue is clear" message="No evidence findings currently need a human decision." /> : null}
      </View>
      <Modal visible={Boolean(editItem)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditItem(null)}>
        <View style={styles.modal}>
          <PageHeading title="Edit finding" subtitle={editItem ? findingLabel(editItem.suggestion.suggestionType) : ""} />
          <Field label={editItem?.suggestion.suggestionType === "damage_candidate" ? "Damage location" : "Reviewed value"} value={editText} onChangeText={setEditText} />
          <Notice tone="info" title="Human override" message="The original provider or reference mapping, reviewer, and edited value remain in the audit trail." />
          <ActionButton label="Save reviewed value" onPress={() => void saveEdit()} />
          <ActionButton label="Cancel" tone="secondary" onPress={() => setEditItem(null)} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  selection: { color: colors.ink, fontWeight: "800", marginBottom: 10 },
  bulkActions: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: colors.line, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
  headingCopy: { flex: 1, gap: 2 },
  vehicle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  vin: { color: colors.muted, fontSize: 10 },
  finding: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 5 },
  findingLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  evidence: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  explanation: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  confidence: { color: colors.teal, fontSize: 11, fontWeight: "700" },
  actions: { marginTop: 14, gap: 8 },
  modal: { flex: 1, padding: 20, paddingTop: 56, gap: 16, backgroundColor: colors.canvas }
});
