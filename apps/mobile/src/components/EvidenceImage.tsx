import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { ImageOff } from "lucide-react-native";
import { mobileConfig } from "../config";
import { colors } from "../theme";
import type { VehiclePhoto } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function EvidenceImage({ photo }: { photo: VehiclePhoto }) {
  const { request } = useWorkspace();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    request<{ imageUrl: string }>(`/api/photos/${photo.id}/image?intent=preview`)
      .then((result) => {
        if (!active) return;
        const resolved = result.imageUrl.startsWith("/") ? `${mobileConfig.apiBaseUrl}${result.imageUrl}` : result.imageUrl;
        setUri(resolved);
      })
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [photo.id, request]);
  if (failed) return <View style={styles.placeholder}><ImageOff size={22} color={colors.muted} /></View>;
  if (!uri) return <View style={styles.placeholder}><ActivityIndicator color={colors.blue} /></View>;
  return <Image source={{ uri }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={`${photo.declaredAngle ?? "Vehicle"} evidence`} />;
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.graySoft },
  placeholder: { width: "100%", aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center", backgroundColor: colors.graySoft }
});
