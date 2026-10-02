import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { canRole, inspectorChecklistAreas, type ConditionQcIssue, type InspectorObservation } from "@inspectiq/shared";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import type { InspectionBundle } from "../types";
import { colors } from "../theme";
import { ActionButton, Card, Notice, Section, StatusPill } from "./Primitives";

export function ConditionQcPanel({ bundle, onPhoto, onFinding }: {
  bundle: InspectionBundle; onPhoto: (id: string) => void; onFinding: () => void;
}) {
  const { session, canMutate } = useAuth();
  const { online, request, refresh } = useWorkspace();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [area, setArea] = useState<InspectorObservation["area"]>("exterior");
  const [outcome, setOutcome] = useState<InspectorObservation["outcome"]>("damage_observed");
  const [notes, setNotes] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef(Crypto.randomUUID());
  const qc = bundle.conditionQc;
  if (!session || !qc) return null;
  const writable = canMutate && online && bundle.inspection.status !== "FINALIZED";
  const perform = async (path: string, body: unknown, success?: () => void) => {
    setBusy(true); setError(null);
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      success?.();
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Action was not saved."); }
    finally { setBusy(false); }
  };
  const review = (issue: ConditionQcIssue, decision: "reviewed" | "overridden") => perform(
    `/api/inspections/${bundle.inspection.id}/condition-qc/review`,
    { issueId: issue.id, fingerprint: issue.fingerprint, decision, reason: reason[issue.id] ?? "" }
  );
  return <Section title="Condition-report QC" action={<StatusPill label={`${qc.openCount} open`} tone={qc.openCount ? "warn" : "good"} />}>
    <Card>
      <Text style={styles.copy}>Uncertain evidence needs review or recapture. No finding does not mean damage-free. Human approval is always required.</Text>
      {(["vin", "odometer"] as const).map((field) => <View key={field} style={styles.identity}>
        <Text style={styles.title}>{field === "vin" ? "VIN" : "Mileage"}: {qc.identity[field].status.replaceAll("_", " ")}</Text>
        <Text style={styles.copy}>Intake {qc.identity[field].expected} · image {qc.identity[field].observed ?? "not confirmed"}</Text>
      </View>)}
      {!online ? <Text style={styles.copy}>Cached QC results. Reconnect to save notes or decisions; they are not queued offline.</Text> : null}
    </Card>
    {error ? <Notice tone="bad" title="Not saved" message={error} /> : null}
    {qc.issues.map((issue) => <Card key={issue.id}>
      <Text style={styles.title}>{issue.title}</Text>
      <StatusPill label={issue.objective ? "Evidence required" : issue.status} tone={issue.status === "open" ? "warn" : "good"} />
      <Text style={styles.copy}>{issue.detail}</Text>
      <Text style={styles.copy}>{issue.action}</Text>
      {issue.photoIds.map((id) => <ActionButton key={id} label={`View ${bundle.photos.find((p) => p.id === id)?.declaredAngle?.replaceAll("_", " ") ?? "evidence"}`} tone="secondary" onPress={() => onPhoto(id)} />)}
      {issue.suggestionId && issue.status === "open" ? <ActionButton label="Review finding" tone="secondary" onPress={onFinding} /> : null}
      {issue.decision ? <Text style={styles.copy}>{issue.decision.actor}: {issue.decision.reason}</Text> : null}
      {writable && canRole(session.actor.role, "report:approve") && issue.status === "open" && !issue.objective && !issue.suggestionId ? <View style={styles.form}>
        <TextInput style={styles.input} accessibilityLabel={`Rationale for ${issue.title}`} placeholder="Review rationale (at least 10 characters)" multiline maxLength={1000} value={reason[issue.id] ?? ""} onChangeText={(value) => setReason((r) => ({ ...r, [issue.id]: value }))} />
        <ActionButton label="Acknowledge limitation" tone="secondary" disabled={busy || (reason[issue.id]?.trim().length ?? 0) < 10} onPress={() => void review(issue, "reviewed")} />
        <ActionButton label="Override judgment" tone="secondary" disabled={busy || (reason[issue.id]?.trim().length ?? 0) < 10} onPress={() => void review(issue, "overridden")} />
        <Text style={styles.copy}>The limitation stays disclosed; this never changes identity to verified.</Text>
      </View> : null}
    </Card>)}
    {qc.observations.map((observation) => <Card key={observation.id}>
      <Text style={styles.title}>{observation.area.replaceAll("_", " ")} · {observation.outcome.replaceAll("_", " ")}</Text>
      <Text style={styles.copy}>{observation.notes}</Text><Text style={styles.copy}>{observation.recordedBy}{observation.photoId ? "" : " · in-person; no linked photo"}</Text>
      {observation.photoId ? <ActionButton label="View evidence" tone="secondary" onPress={() => onPhoto(observation.photoId!)} /> : null}
    </Card>)}
    <Card>
      <ActionButton label={showDraft ? "Hide preliminary draft" : "Automatic preliminary condition report"} tone="secondary" onPress={() => setShowDraft(!showDraft)} />
      {showDraft ? <View><Text style={styles.copy}>Updates from evidence and notes before grading. Not approved for buyer release.</Text>{qc.draftSections?.map((section) => <View key={section.key}><Text style={styles.title}>{section.title} · {section.status.replaceAll("_", " ").toLowerCase()}</Text>{section.observations.map((note, index) => <Text key={index} style={styles.copy}>{note}</Text>)}</View>)}</View> : null}
    </Card>
    {writable && canRole(session.actor.role, "damage:create") ? <Card>
      <ActionButton label={showForm ? "Hide checklist entry" : "Add inspector note / checklist"} tone="secondary" onPress={() => setShowForm(!showForm)} />
      {showForm ? <View style={styles.form}>
        <Text style={styles.title}>Checklist area</Text>
        <View style={styles.choices}>{inspectorChecklistAreas.map((value) => <ActionButton key={value} label={value.replaceAll("_", " ")} tone={area === value ? "primary" : "secondary"} onPress={() => setArea(value)} />)}</View>
        <Text style={styles.title}>Observation</Text>
        <View style={styles.choices}>{(["damage_observed", "no_visible_damage", "unable_to_assess", "not_checked"] as const).map((value) => <ActionButton key={value} label={value.replaceAll("_", " ")} tone={outcome === value ? "primary" : "secondary"} onPress={() => setOutcome(value)} />)}</View>
        <Text style={styles.title}>Supporting evidence</Text>
        <ActionButton label="In-person observation — no photo" tone={photoId === null ? "primary" : "secondary"} onPress={() => setPhotoId(null)} />
        {bundle.photos.filter((p) => p.uploadStatus === "uploaded").map((p) => <ActionButton key={p.id} label={p.originalFilename} tone={photoId === p.id ? "primary" : "secondary"} onPress={() => setPhotoId(p.id)} />)}
        <TextInput style={styles.input} multiline accessibilityLabel="Inspector checklist note" placeholder="Describe observations and limitations" value={notes} maxLength={800} onChangeText={setNotes} />
        <ActionButton label={busy ? "Saving…" : "Save observation"} disabled={busy || !notes.trim()} onPress={() => void perform(`/api/inspections/${bundle.inspection.id}/observations`, { area, outcome, notes, photoId, operationId: operationId.current }, () => { setNotes(""); operationId.current = Crypto.randomUUID(); setShowForm(false); })} />
        <Text style={styles.copy}>Attributed notes enter the next report draft. An unlinked damage observation needs reviewer acknowledgment.</Text>
      </View> : null}
    </Card> : null}
  </Section>;
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "800", color: colors.ink, marginVertical: 6 },
  copy: { fontSize: 13, lineHeight: 19, color: colors.muted, marginVertical: 5 },
  identity: { marginTop: 8 }, form: { gap: 10, marginTop: 12 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, minHeight: 80, color: colors.ink, textAlignVertical: "top" }
});
