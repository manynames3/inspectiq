import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { canRole } from "@inspectiq/shared";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/Fields";
import { ActionButton, Card, Notice, PageHeading, Screen, StatusPill } from "../components/Primitives";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";
import type { ReportVersion } from "../types";
import { BrandWordmark } from "../components/BrandWordmark";

type Props = NativeStackScreenProps<RootStackParamList, "ReportEditor">;

export function ReportEditorScreen({ route }: Props) {
  const { session, canMutate } = useAuth();
  const { bundleById, request, refresh, online } = useWorkspace();
  const bundle = bundleById(route.params.inspectionId);
  const report = bundle?.finalReport ?? null;
  const [body, setBody] = useState(report?.reportBody ?? "");
  const [comment, setComment] = useState(report?.reviewerComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [comparison, setComparison] = useState<ReportVersion | null>(null);
  const [gradeValue, setGradeValue] = useState("");
  const [gradeReason, setGradeReason] = useState("");
  useEffect(() => {
    setGradeValue(bundle?.conditionGrade ? String(bundle.conditionGrade.suggestedGrade) : "");
    setGradeReason("");
  }, [bundle?.conditionGrade?.id, bundle?.conditionGrade?.version]);
  useEffect(() => {
    setBody(report?.reportBody ?? "");
    setComment(report?.reviewerComment ?? "");
  }, [report?.id, report?.version]);
  useEffect(() => {
    if (!report) {
      setVersions([]);
      return;
    }
    request<ReportVersion[]>(`/api/reports/${report.id}/versions`)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [report?.id, report?.version, request]);
  if (!session || !bundle) return <Screen><Notice tone="warn" title="Report unavailable" message="Refresh the inspection while online." /></Screen>;
  const unsavedText = Boolean(report && body !== report.reportBody);
  const unsavedComment = Boolean(report && comment !== (report.reviewerComment ?? ""));

  const action = async (path: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const payloadKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : undefined;
      await request(path, {
        method: path === `/api/reports/${report?.id}` ? "PATCH" : "POST",
        body: JSON.stringify(payload),
        idempotencyKey: payloadKey
      });
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Report action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeading title="Condition report" subtitle={`${bundle.inspection.year} ${bundle.inspection.make} ${bundle.inspection.model} · ${bundle.inspection.vin}`} />
      {!online ? <Notice tone="offline" title="Connection required" message="Report edits, approval, and finalization are online-only." /> : null}
      {error ? <Notice tone="bad" title="Report not updated" message={error} /> : null}
      <Card>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.grade}>
              {bundle.conditionGrade
                ? `${(bundle.conditionGrade.approvedGrade ?? bundle.conditionGrade.suggestedGrade).toFixed(1)} / 5.0`
                : "Not graded"}
            </Text>
            <Text style={styles.gradeCopy}>
              {bundle.conditionGrade?.approvedGrade == null
                ? "Suggested InspectIQ Reference Grade · reviewer approval required"
                : "Reviewer-approved InspectIQ Reference Grade"}
            </Text>
          </View>
          <StatusPill label={report ? report.approvalStatus.replaceAll("_", " ") : "Not started"} tone={report?.finalizedAt ? "good" : report ? "info" : "neutral"} />
        </View>
        {report ? <Text style={styles.version}>Version {report.version}{report.approvedBy ? ` · approved by ${report.approvedBy}` : ""}</Text> : null}
      </Card>
      {report ? <Card style={styles.document}>
        <BrandWordmark />
        <Text style={styles.documentState}>{body !== report.reportBody ? "UNSAVED DRAFT · NOT REVIEWED" : report.finalizedAt ? `FINALIZED · VERSION ${report.version}` : report.approvalStatus === "approved" ? "APPROVED · AWAITING RELEASE" : "DRAFT · NOT APPROVED FOR BUYER RELEASE"}</Text>
        <Text style={styles.documentTitle}>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</Text>
        <Text style={styles.documentIdentity}>VIN: {bundle.conditionQc?.identity.vin.status.replaceAll("_", " ") ?? "not verified"} · Mileage: {bundle.conditionQc?.identity.odometer.status.replaceAll("_", " ") ?? "not verified"}</Text>
        <Text style={styles.documentBody}>{body}</Text>
        {bundle.conditionQc?.issues.length ? <View style={styles.documentLimitations}><Text style={styles.documentIdentity}>Evidence limitations</Text>{bundle.conditionQc.issues.map((issue) => <Text style={styles.documentIdentity} key={issue.id}>{issue.title}. {issue.detail}{issue.decision ? ` Review rationale: ${issue.decision.reason}` : " Unresolved."}</Text>)}</View> : null}
        <Text style={styles.documentIdentity}>{body !== report.reportBody ? "New language needs human approval." : report.approvedBy ? `Approved by ${report.approvedBy}${report.approvedAt ? ` · ${new Date(report.approvedAt).toLocaleString()}` : ""}` : "Human approval required."}</Text>
      </Card> : null}
      {!report?.finalizedAt && bundle.conditionGrade && bundle.conditionGrade.approvedGrade == null && canRole(session.actor.role, "grade:approve") ? <Card>
        <Field label="Reviewed grade (0–5)" keyboardType="decimal-pad" value={gradeValue} onChangeText={setGradeValue} />
        <Field label="Grade override reason" value={gradeReason} onChangeText={setGradeReason} placeholder="Required when changing the suggested grade" />
        <ActionButton label="Approve reviewed reference grade" disabled={busy || !online || !canMutate || bundle.conditionGrade.evidenceBlockers.length > 0 || !gradeValue.trim() || !Number.isFinite(Number(gradeValue)) || Number(gradeValue) < 0 || Number(gradeValue) > 5 || (Math.abs(Number(gradeValue) - bundle.conditionGrade.suggestedGrade) >= 0.05 && !gradeReason.trim())} onPress={() => void action(`/api/inspections/${bundle.inspection.id}/condition-grade/approve`, { approvedGrade: Number(gradeValue), overrideReason: gradeReason || undefined })} />
      </Card> : null}
      {!report ? (
        <ActionButton label={busy ? "Drafting…" : "Generate report draft"} disabled={busy || !online || !canMutate || !canRole(session.actor.role, "report:draft") || bundle.conditionGrade?.approvedGrade == null} onPress={() => void action(`/api/inspections/${bundle.inspection.id}/ai-report`, { idempotencyKey: `mobile-report:${bundle.inspection.id}:${bundle.conditionGrade?.id}` })} />
      ) : (
        <>
          <Field label="Buyer-facing report" value={body} onChangeText={setBody} multiline editable={!report.finalizedAt && canMutate && canRole(session.actor.role, "report:edit")} />
          <Field label="Reviewer comment" value={comment} onChangeText={setComment} multiline editable={!report.finalizedAt && canMutate && canRole(session.actor.role, "report:edit")} />
          {unsavedText || unsavedComment ? <Notice tone="warn" title="Unsaved report changes" message="Save the current version before release. New language requires human approval." /> : null}
          <Notice tone="info" title="Buyer report boundary" message="Model provider, raw confidence payloads, prompt internals, and developer terminology are excluded from the finalized report." />
          {!report.finalizedAt && canRole(session.actor.role, "report:draft") ? <ActionButton label="Regenerate from current evidence" tone="secondary" disabled={busy || !online || !canMutate || bundle.conditionGrade?.approvedGrade == null} onPress={() => void action(`/api/inspections/${bundle.inspection.id}/ai-report`, { idempotencyKey: `mobile-report:${bundle.inspection.id}:${bundle.conditionGrade?.id}` })} /> : null}
          {versions.length > 0 ? (
            <Card>
              <Text style={styles.historyTitle}>Version history</Text>
              <View style={styles.versionList}>
                {versions.map((version) => (
                  <Pressable key={version.id} onPress={() => setComparison(comparison?.id === version.id ? null : version)} style={[styles.versionRow, comparison?.id === version.id && styles.versionRowActive]} accessibilityRole="button">
                    <View>
                      <Text style={styles.versionLabel}>v{version.version} · {version.changeType}</Text>
                      <Text style={styles.versionMeta}>{new Date(version.createdAt).toLocaleString()} · {version.changedBy}</Text>
                    </View>
                    <StatusPill label={version.approvalStatus.replaceAll("_", " ")} tone={version.approvalStatus === "finalized" ? "good" : "neutral"} />
                  </Pressable>
                ))}
              </View>
              {comparison ? (
                <View style={styles.comparison}>
                  <Text style={styles.comparisonTitle}>Comparing v{comparison.version} with current v{report.version}</Text>
                  <Text style={styles.comparisonBody}>{comparison.reportBody}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}
          {!report.finalizedAt && canRole(session.actor.role, "report:edit") ? <ActionButton label="Save report version" tone="secondary" disabled={busy || !online || !canMutate} onPress={() => void action(`/api/reports/${report.id}`, { reportBody: body, reviewerComment: comment, expectedVersion: report.version })} /> : null}
          {!report.finalizedAt && canRole(session.actor.role, "report:approve") ? <ActionButton label="Approve report" disabled={busy || !online || !canMutate || unsavedText} onPress={() => void action(`/api/reports/${report.id}/approve`, { reviewerComment: comment, expectedVersion: report.version })} /> : null}
          {!report.finalizedAt && canRole(session.actor.role, "report:finalize") ? <ActionButton label="Finalize buyer report" disabled={busy || !online || !canMutate || report.approvalStatus !== "approved" || unsavedText || unsavedComment} onPress={() => void action(`/api/reports/${report.id}/finalize`, { expectedVersion: report.version })} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  document: { padding: 22, borderRadius: 3, gap: 16, backgroundColor: "#f9fbf8", borderLeftWidth: 3, borderLeftColor: colors.teal },
  documentState: { color: colors.amber, fontSize: 10, letterSpacing: .7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  documentTitle: { color: colors.ink, fontSize: 24, fontWeight: "600", letterSpacing: -.6 },
  documentIdentity: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  documentBody: { color: colors.ink, fontSize: 14, lineHeight: 24 },
  documentLimitations: { paddingTop: 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  grade: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  gradeCopy: { color: colors.muted, fontSize: 12 },
  version: { color: colors.muted, fontSize: 12, marginTop: 12 },
  historyTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  versionList: { gap: 6 },
  versionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 6 },
  versionRowActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  versionLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  versionMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  comparison: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 7 },
  comparisonTitle: { color: colors.blue, fontSize: 12, fontWeight: "800" },
  comparisonBody: { color: colors.muted, fontSize: 12, lineHeight: 18 }
});
