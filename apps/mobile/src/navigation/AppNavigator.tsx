import { Pressable, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Activity, AlertTriangle, ClipboardCheck, FileText, Home, ListChecks, LogOut, ShieldCheck, UploadCloud } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { AuditScreen } from "../screens/AuditScreen";
import { CaptureScreen } from "../screens/CaptureScreen";
import { DamageScreen } from "../screens/DamageScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HealthScreen } from "../screens/HealthScreen";
import { InspectionDetailScreen } from "../screens/InspectionDetailScreen";
import { NewInspectionScreen } from "../screens/NewInspectionScreen";
import { QueueScreen } from "../screens/QueueScreen";
import { ReportEditorScreen } from "../screens/ReportEditorScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { UploadsScreen } from "../screens/UploadsScreen";
import { colors } from "../theme";
import { tabBarLayout } from "./layout";
import type { MainTabParamList, RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const appTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.blue, background: colors.canvas, card: colors.surface, border: colors.line, text: colors.ink }
};

function MainTabs() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  if (!session) return null;
  const commonOptions = {
    headerShown: false,
    tabBarActiveTintColor: colors.blue,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: styles.tabLabel,
    tabBarStyle: [styles.tabBar, tabBarLayout(insets.bottom)]
  };
  return (
    <Tabs.Navigator screenOptions={commonOptions}>
      <Tabs.Screen name="Home" component={DashboardScreen} options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      {session.actor.role === "inspector" ? (
        <>
          <Tabs.Screen name="Queue" component={QueueScreen} options={{ tabBarIcon: ({ color, size }) => <ClipboardCheck color={color} size={size} /> }} />
          <Tabs.Screen name="Uploads" component={UploadsScreen} options={{ tabBarIcon: ({ color, size }) => <UploadCloud color={color} size={size} /> }} />
          <Tabs.Screen name="Audit" component={AuditScreen} options={{ tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} /> }} />
        </>
      ) : session.actor.role === "reviewer" ? (
        <>
          <Tabs.Screen name="Review" component={ReviewScreen} options={{ tabBarIcon: ({ color, size }) => <ListChecks color={color} size={size} /> }} />
          <Tabs.Screen name="Damage" component={DamageScreen} options={{ tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={size} /> }} />
          <Tabs.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
          <Tabs.Screen name="Audit" component={AuditScreen} options={{ tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} /> }} />
        </>
      ) : (
        <>
          <Tabs.Screen name="Review" component={ReviewScreen} options={{ tabBarIcon: ({ color, size }) => <ListChecks color={color} size={size} /> }} />
          <Tabs.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
          <Tabs.Screen name="Health" component={HealthScreen} options={{ tabBarIcon: ({ color, size }) => <Activity color={color} size={size} /> }} />
          <Tabs.Screen name="Audit" component={AuditScreen} options={{ tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} /> }} />
        </>
      )}
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { session, signOut } = useAuth();
  if (!session) return null;
  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "800" },
        headerShadowVisible: true,
        headerBackTitle: "Back",
        headerRight: () => (
          <Pressable onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut}>
            <View style={styles.roleCopy}>
              <Text style={styles.role}>{session.actor.role}</Text>
              <Text style={styles.mode}>{session.mode === "evaluation" ? "Evaluation" : "Secure session"}</Text>
            </View>
            <LogOut size={18} color={colors.blue} />
          </Pressable>
        )
      }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ title: "InspectIQ" }} />
        <Stack.Screen name="InspectionDetail" component={InspectionDetailScreen} options={{ title: "Inspection" }} />
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: "Required photos", headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="NewInspection" component={NewInspectionScreen} options={{ title: "New inspection" }} />
        <Stack.Screen name="ReportEditor" component={ReportEditorScreen} options={{ title: "Condition report" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: { paddingTop: 5, borderTopColor: colors.line },
  tabLabel: { fontSize: 10, fontWeight: "700" },
  signOut: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38 },
  roleCopy: { alignItems: "flex-end" },
  role: { color: colors.ink, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  mode: { color: colors.muted, fontSize: 9 }
});
