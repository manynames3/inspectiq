import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileConfig } from "../config";
import { colors } from "../theme";
import type { VehiclePhoto } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Props = {
  photo: VehiclePhoto;
  position: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function EvidencePhotoViewer({ photo, position, total, onClose, onPrevious, onNext }: Props) {
  const { request } = useWorkspace();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -50) onNext();
      if (gesture.dx >= 50) onPrevious();
    }
  }), [onNext, onPrevious]);

  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    request<{ imageUrl: string }>(`/api/photos/${photo.id}/image?intent=preview`)
      .then((result) => {
        if (!active) return;
        setUri(result.imageUrl.startsWith("/") ? `${mobileConfig.apiBaseUrl}${result.imageUrl}` : result.imageUrl);
      })
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [photo.id, request]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.counter}>{position + 1} of {total}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close evidence photo" style={styles.closeButton}>
            <X size={24} color="white" />
          </Pressable>
        </View>
        <View style={styles.viewer} {...panResponder.panHandlers}>
          {failed ? <View style={styles.failed}><ImageOff size={34} color="#B7C4D3" /><Text style={styles.failedText}>Evidence preview unavailable</Text></View> : null}
          {!failed && !uri ? <ActivityIndicator size="large" color="white" /> : null}
          {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" onError={() => setFailed(true)} accessibilityLabel={`${photo.declaredAngle ?? "Vehicle"} evidence enlarged`} /> : null}
        </View>
        <View style={styles.footer}>
          <Pressable onPress={onPrevious} disabled={total < 2} accessibilityRole="button" accessibilityLabel="Previous evidence photo" style={[styles.arrowButton, total < 2 && styles.disabled]}>
            <ChevronLeft size={30} color="white" />
          </Pressable>
          <View style={styles.caption}>
            <Text style={styles.angle}>{photo.declaredAngle ? photo.declaredAngle.replaceAll("_", " ") : "Unclassified"}</Text>
            <Text style={styles.hint}>Swipe left or right to compare evidence</Text>
          </View>
          <Pressable onPress={onNext} disabled={total < 2} accessibilityRole="button" accessibilityLabel="Next evidence photo" style={[styles.arrowButton, total < 2 && styles.disabled]}>
            <ChevronRight size={30} color="white" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "rgba(4, 13, 24, 0.98)" },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  counter: { color: "#DCE8F4", fontSize: 14, fontWeight: "800" },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  viewer: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  failed: { alignItems: "center", gap: 12 },
  failedText: { color: "#B7C4D3", fontSize: 14, fontWeight: "700" },
  footer: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, gap: 10 },
  arrowButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  disabled: { opacity: 0.35 },
  caption: { flex: 1, alignItems: "center", gap: 4 },
  angle: { color: "white", fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
  hint: { color: "#B7C4D3", fontSize: 11, textAlign: "center" }
});
