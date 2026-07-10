import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthGate } from "./src/screens/AuthGate";
import { WorkspaceProvider } from "./src/workspace/WorkspaceContext";

function Root() {
  const { session } = useAuth();
  return session ? (
    <WorkspaceProvider>
      <AppNavigator />
    </WorkspaceProvider>
  ) : <AuthGate />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
