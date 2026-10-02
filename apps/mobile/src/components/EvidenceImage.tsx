import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { ImageOff } from "lucide-react-native";
import { mobileConfig } from "../config";
import { colors } from "../theme";
import type { VehiclePhoto } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function EvidenceImage({ photo, onPress }: { photo: VehiclePhoto; onPress?: () => void }) {
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
  const content = failed
    ? <View style={styles.placeholder}><ImageOff size={22} color={colors.muted} /></View>
    : !uri
      ? <View style={styles.placeholder}><ActivityIndicator color={colors.blue} /></View>
      : <Image source={{ uri }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={`${photo.declaredAngle ?? "Vehicle"} evidence`} />;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessible collapsable={false} accessibilityRole="button" accessibilityLabel={`Open ${photo.declaredAngle ?? "vehicle"} evidence photo`} style={styles.pressable}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  image: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.graySoft },
  placeholder: { width: "100%", aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center", backgroundColor: colors.graySoft }
});
