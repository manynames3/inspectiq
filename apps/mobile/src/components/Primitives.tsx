import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle
} from "react-native";
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from "lucide-react-native";
import { colors, spacing } from "../theme";

export function Screen({ children, refresh, refreshing = false, contentStyle }: {
  children: ReactNode;
  refresh?: () => void;
  refreshing?: boolean;
  contentStyle?: ViewStyle;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {refresh ? (
        <Pressable style={styles.refresh} onPress={refresh} accessibilityRole="button" accessibilityLabel="Refresh workspace">
          {refreshing ? <ActivityIndicator size="small" color={colors.blue} /> : <RefreshCw size={16} color={colors.blue} />}
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <View style={[styles.metric, tone !== "default" && styles[`metric_${tone}`]]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "info" | "good" | "warn" | "bad" }) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function ActionButton({ label, icon, tone = "primary", disabled, ...props }: PressableProps & {
  label: string;
  icon?: ReactNode;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        styles[`button_${tone}`],
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed
      ]}
    >
      {icon}
      <Text style={[styles.buttonText, tone !== "primary" && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ tone = "info", title, message }: {
  tone?: "info" | "warn" | "bad" | "offline";
  title: string;
  message: string;
}) {
  const Icon = tone === "offline" ? WifiOff : AlertTriangle;
  return (
    <View style={[styles.notice, styles[`notice_${tone}`]]} accessibilityRole="alert">
      <Icon size={18} color={tone === "bad" ? colors.red : tone === "warn" ? colors.amber : colors.blue} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.empty}>
      <Inbox size={28} color={colors.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  screenContent: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  refresh: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 10 },
  refreshText: { color: colors.blue, fontSize: 14, fontWeight: "700" },
  heading: { gap: 4 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: spacing.lg },
  metric: { flex: 1, minWidth: 140, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, gap: 6 },
  metric_good: { borderLeftWidth: 3, borderLeftColor: colors.green },
  metric_warn: { borderLeftWidth: 3, borderLeftColor: colors.amber },
  metric_bad: { borderLeftWidth: 3, borderLeftColor: colors.red },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  metricValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  pill: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.graySoft },
  pill_info: { backgroundColor: colors.blueSoft },
  pill_good: { backgroundColor: colors.greenSoft },
  pill_warn: { backgroundColor: colors.amberSoft },
  pill_bad: { backgroundColor: colors.redSoft },
  pill_neutral: { backgroundColor: colors.graySoft },
  pillText: { fontSize: 11, fontWeight: "800", color: colors.muted },
  pillText_info: { color: colors.blue },
  pillText_good: { color: colors.green },
  pillText_warn: { color: colors.amber },
  pillText_bad: { color: colors.red },
  pillText_neutral: { color: colors.muted },
  button: { minHeight: 46, paddingHorizontal: 16, borderRadius: 7, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  button_primary: { backgroundColor: colors.blue },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  button_danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: "#F3AEB2" },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  buttonTextSecondary: { color: colors.ink },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 7, borderWidth: 1 },
  notice_info: { backgroundColor: colors.blueSoft, borderColor: "#B8D2F7" },
  notice_warn: { backgroundColor: colors.amberSoft, borderColor: "#F1C98E" },
  notice_bad: { backgroundColor: colors.redSoft, borderColor: "#F4B7BB" },
  notice_offline: { backgroundColor: colors.blueSoft, borderColor: "#B8D2F7" },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  noticeMessage: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: "center", paddingVertical: 44, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  emptyMessage: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 }
});
