import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Eye, LockKeyhole, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { ActionButton, Notice } from "../components/Primitives";
import { mobileConfig } from "../config";
import { colors } from "../theme";
import { BrandWordmark } from "../components/BrandWordmark";

export function AuthGate() {
  const { restoring, authError, oidcConfigured, signIn, enterEvaluation } = useAuth();
  if (restoring) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.blue} /><Text style={styles.loadingText}>Restoring secure session…</Text></View>;
  }
  return (
    <ScrollView style={styles.viewport} contentContainerStyle={styles.screen}>
      <BrandWordmark />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>VEHICLE CONDITION OPERATIONS</Text>
        <Text style={styles.title}>Inspection decisions from field evidence to buyer release.</Text>
        <Text style={styles.subtitle}>Secure role-based access for required-angle capture, human review, condition reports, and operational recovery.</Text>
        <View style={styles.trustRow}>
          <View style={styles.trustItem}><ShieldCheck size={17} color={colors.teal} /><Text style={styles.trustText}>Cognito OIDC</Text></View>
          <View style={styles.trustItem}><LockKeyhole size={17} color={colors.teal} /><Text style={styles.trustText}>Device-secure session</Text></View>
        </View>
        {authError ? <Notice tone="bad" title="Sign-in unavailable" message={authError} /> : null}
        <ActionButton label={oidcConfigured ? "Sign in with Cognito" : "Cognito configuration required"} disabled={!oidcConfigured} onPress={() => void signIn()} />
        {mobileConfig.evaluationEnabled ? (
          <ActionButton label="Open Evaluation Workspace" tone="secondary" icon={<Eye size={18} color={colors.ink} />} onPress={() => void enterEvaluation()} />
        ) : null}
        <Text style={styles.evaluationNote}>Evaluation access is read-only. Upload, analysis, decisions, and report mutations require an authenticated role.</Text>
      </View>
      <Text style={styles.footer}>AWS serverless · human-reviewed AI · auditable release</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: colors.canvas },
  screen: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 28 },
  content: { flexGrow: 1, justifyContent: "center", gap: 16, paddingVertical: 32 },
  eyebrow: { color: colors.teal, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 41, fontWeight: "600", letterSpacing: -.8 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  trustRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginVertical: 4 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  evaluationNote: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
  footer: { color: colors.muted, fontSize: 11, textAlign: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.canvas },
  loadingText: { color: colors.muted, fontSize: 14 }
});
