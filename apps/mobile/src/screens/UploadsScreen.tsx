import { StyleSheet, Text, View } from "react-native";
import { CloudUpload, Trash2 } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, Card, EmptyState, Notice, PageHeading, Screen, StatusPill } from "../components/Primitives";
import { removeUploadOperation } from "../offline/database";
import { colors } from "../theme";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function UploadsScreen() {
  const { canMutate } = useAuth();
  const { pendingUploads, syncNow, refresh, online, lastSync } = useWorkspace();
  const remove = async (operationId: string) => {
    await removeUploadOperation(operationId, true);
    await refresh();
  };
  return (
    <Screen refresh={() => void refresh()}>
      <PageHeading title="Upload queue" subtitle={`${pendingUploads.length} local operation${pendingUploads.length === 1 ? "" : "s"}`} />
      {!online ? <Notice tone="offline" title="Uploads paused" message="Capture work is safe on this device and will resume after reconnection." /> : null}
      {lastSync ? <Notice tone="info" title="Last sync" message={`${lastSync.uploaded} uploaded · ${lastSync.failed} retrying · ${lastSync.blocked} need attention`} /> : null}
      <ActionButton label="Sync now" icon={<CloudUpload size={18} color="white" />} disabled={!online || !canMutate || pendingUploads.length === 0} onPress={() => void syncNow()} />
      <View style={styles.list}>
        {pendingUploads.map((operation) => (
          <Card key={operation.id}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={styles.title}>{operation.declaredAngle.replaceAll("_", " ")}</Text>
                <Text style={styles.detail}>{operation.width}×{operation.height} · attempt {operation.attempts}/5</Text>
              </View>
              <StatusPill label={operation.status} tone={operation.status === "blocked" ? "bad" : operation.status === "failed" ? "warn" : "info"} />
            </View>
            {operation.lastError ? <Text style={styles.error}>{operation.lastError}</Text> : null}
            <ActionButton label="Remove local capture" tone="danger" icon={<Trash2 size={16} color={colors.red} />} onPress={() => void remove(operation.id)} />
          </Card>
        ))}
        {pendingUploads.length === 0 ? <EmptyState title="Upload queue is clear" message="New offline captures will appear here until S3 confirmation succeeds." /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800", textTransform: "capitalize" },
  detail: { color: colors.muted, fontSize: 12 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, marginVertical: 10 }
});
