import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { canRole } from "@inspectiq/shared";
import { MobileApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Inspection, InspectionBundle } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { colors } from "../theme";
import { Field } from "./Fields";
import { ActionButton, Card, Notice } from "./Primitives";

type ReinspectionAttempt = { reason: string; operationId: string; expectedReportVersion: number };

export function ReinspectionPanel({ bundle, onOpenInspection }: {
  bundle: InspectionBundle;
  onOpenInspection: (inspectionId: string) => void;
}) {
  const { session, canMutate } = useAuth();
  const { online, request, refresh } = useWorkspace();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<ReinspectionAttempt | null>(null);
  const inFlight = useRef(false);
  const { inspection, finalReport } = bundle;
  const finalized = inspection.status === "FINALIZED" && Boolean(finalReport?.finalizedAt);
  const authorized = Boolean(session?.mode === "oidc" && canMutate && canRole(session.actor.role, "inspection:reinspect"));
  const apiCapable = typeof bundle.requiresReinspection === "boolean";
  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 1000;
  const versionValid = Boolean(finalReport && Number.isInteger(finalReport.version) && finalReport.version > 0);

  const start = async () => {
    if (!authorized || !apiCapable || !online || !finalized || !versionValid || !reasonValid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // A lost response must retry the exact request, not create another amendment.
    attempt.current ??= { reason: reason.trim(), operationId: Crypto.randomUUID(), expectedReportVersion: finalReport!.version };
    setRetrying(true);
    try {
      const result = await request<{ inspection: Inspection; reused: boolean }>(`/api/inspections/${inspection.id}/reinspections`, {
        method: "POST",
        body: JSON.stringify(attempt.current)
      });
      await refresh();
      onOpenInspection(result.inspection.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Reinspection was not opened. Retry with the same request.");
      if (requestError instanceof MobileApiError && requestError.status >= 400 && requestError.status < 500 && ![408, 429].includes(requestError.status)) {
        attempt.current = null;
        setRetrying(false);
        await refresh();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!inspection.reinspectionSourceInspectionId && !finalized && !bundle.requiresReinspection) return null;

  return <View style={styles.panel}>
    {inspection.reinspectionSourceInspectionId ? <Card>
      <Text style={styles.title}>Fresh reinspection · linked history</Text>
      <Text style={styles.copy}>Based on published report version {inspection.reinspectionSourceReportVersion ?? "unknown"}. The original inspection and report remain unchanged. New evidence, review, and approval are required.</Text>
      {inspection.reinspectionReason ? <Text style={styles.copy}>Recorded reason: {inspection.reinspectionReason}</Text> : null}
      <ActionButton label="View original inspection" tone="secondary" onPress={() => onOpenInspection(inspection.reinspectionSourceInspectionId!)} />
    </Card> : null}
    {bundle.requiresReinspection ? <Notice tone="warn" title="Historical release · reinspection required" message="This report was published before the current evidence-QC rules. Its original release and history are preserved, but it is not approved under the current evidence-QC rules. Start a separate inspection with fresh evidence and approvals." /> : null}
    {finalized && bundle.requiresReinspection === undefined ? <Notice tone="warn" title="Published history · QC status unverified" message="This record does not include current-policy QC release status. Reconnect and refresh before relying on it as a current-QC release. Published history remains read-only." /> : null}
    {finalized ? <Card>
      <Text style={styles.title}>Preserve published history</Text>
      <Text style={styles.copy}>Reinspection starts a separate draft with vehicle intake details and an audited reason. No photos, findings, grade, approvals, report, or recon authorizations are copied; the published version is not edited.</Text>
      {authorized && apiCapable ? <View style={styles.form}>
        {!online ? <Notice tone="offline" title="Connection required" message="Reinspection is online-only and is never queued offline. Reconnect to create the separate draft." /> : null}
        {error ? <Notice tone="bad" title="Reinspection not opened" message={error} /> : null}
        {showForm ? <>
          <Field label="Reason for reinspection" placeholder="Explain why fresh evidence and a new report are needed (10–1000 characters)" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy && !retrying} />
          {retrying ? <Text style={styles.copy}>The request is retained for a safe retry. Its reason and operation ID will not change if the response was lost.</Text> : null}
          <ActionButton label={busy ? "Opening reinspection…" : retrying ? "Retry reinspection" : "Create fresh inspection"} disabled={busy || !online || !reasonValid || !versionValid} onPress={() => void start()} />
          {!retrying ? <ActionButton label="Cancel reinspection" tone="secondary" onPress={() => setShowForm(false)} /> : null}
        </> : <ActionButton label="Start reinspection" disabled={!online || !versionValid} onPress={() => setShowForm(true)} />}
      </View> : <Text style={styles.copy}>{authorized ? "Update or reconnect to a QC-capable API, then refresh this inspection before starting reinspection. This older record does not advertise reinspection support." : "An authenticated Inspector, Reviewer, or Admin with access to this vehicle must start reinspection."}</Text>}
    </Card> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  form: { gap: 10 }
});
