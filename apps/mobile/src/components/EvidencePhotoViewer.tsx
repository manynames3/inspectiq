import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, Scan, X } from "lucide-react-native";
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const transform = useRef({ zoom: 1, x: 0, y: 0 });
  const bounds = useRef({ width: 0, height: 0 });
  const start = useRef({ x: 0, y: 0 });
  const changeZoom = (value: number) => {
    const next = Math.max(1, Math.min(4, value));
    transform.current = { zoom: next, x: 0, y: 0 };
    setZoom(next); setPan({ x: 0, y: 0 });
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: (_, gesture) => transform.current.zoom > 1 || (Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = { x: transform.current.x, y: transform.current.y }; },
    onPanResponderMove: (_, gesture) => {
      if (transform.current.zoom === 1) return;
      const maxX = bounds.current.width * (transform.current.zoom - 1) / 2;
      const maxY = bounds.current.height * (transform.current.zoom - 1) / 2;
      const next = { x: Math.max(-maxX, Math.min(maxX, start.current.x + gesture.dx)), y: Math.max(-maxY, Math.min(maxY, start.current.y + gesture.dy)) };
      transform.current = { ...transform.current, ...next }; setPan(next);
    },
    onPanResponderRelease: (_, gesture) => {
      if (transform.current.zoom > 1 || Math.abs(gesture.dx) < Math.abs(gesture.dy)) return;
      if (gesture.dx <= -50) onNext();
      if (gesture.dx >= 50) onPrevious();
    }
  }), [onNext, onPrevious]);

  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    changeZoom(1);
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
      <StatusBar barStyle="light-content" />
      <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.counter}>{position + 1} of {total}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close evidence photo" style={styles.closeButton}>
            <X size={24} color="white" />
          </Pressable>
        </View>
        <View style={styles.zoomToolbar}>
          <Text style={styles.hint}>{zoom === 1 ? "Fit to frame" : `${Math.round(zoom * 100)}% · drag to inspect`}</Text>
          <View style={styles.zoomActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom === 1} onPress={() => changeZoom(zoom - .5)} style={[styles.zoomButton, zoom === 1 && styles.disabled]}><Minus size={20} color="white" /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Fit evidence photo" onPress={() => changeZoom(1)} style={styles.zoomButton}><Scan size={20} color="white" /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom === 4} onPress={() => changeZoom(zoom + .5)} style={[styles.zoomButton, zoom === 4 && styles.disabled]}><Plus size={20} color="white" /></Pressable>
          </View>
        </View>
        <View style={styles.viewer} onLayout={(event) => { bounds.current = event.nativeEvent.layout; }} {...panResponder.panHandlers}>
          {failed ? <View style={styles.failed}><ImageOff size={34} color="#a0b4b6" /><Text style={styles.failedText}>Evidence preview unavailable</Text></View> : null}
          {!failed && !uri ? <ActivityIndicator size="large" color="white" /> : null}
          {uri && !failed ? <Image source={{ uri }} style={[styles.image, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }]} resizeMode="contain" onError={() => setFailed(true)} onLoad={(event) => { if (event.nativeEvent.source.width < 16 || event.nativeEvent.source.height < 16) setFailed(true); }} accessibilityLabel={`${photo.declaredAngle ?? "Vehicle"} evidence enlarged`} /> : null}
        </View>
        <View style={styles.footer}>
          <Pressable onPress={onPrevious} disabled={total < 2} accessibilityRole="button" accessibilityLabel="Previous evidence photo" style={[styles.arrowButton, total < 2 && styles.disabled]}>
            <ChevronLeft size={30} color="white" />
          </Pressable>
          <View style={styles.caption}>
            <Text style={styles.angle}>{photo.declaredAngle ? photo.declaredAngle.replaceAll("_", " ") : "Unclassified"}</Text>
            <Text style={styles.hint}>{zoom === 1 ? "Swipe left or right to compare evidence" : "Fit the photo to swipe between evidence"}</Text>
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
  safeArea: { flex: 1, backgroundColor: "#0d0e0e" },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  counter: { color: "#e7eeec", fontSize: 14, fontWeight: "600" },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  zoomToolbar: { paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  zoomActions: { flexDirection: "row", gap: 4 },
  zoomButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  viewer: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  failed: { alignItems: "center", gap: 12 },
  failedText: { color: "#a0b4b6", fontSize: 14, fontWeight: "600" },
  footer: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, gap: 10 },
  arrowButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  disabled: { opacity: 0.35 },
  caption: { flex: 1, alignItems: "center", gap: 4 },
  angle: { color: "white", fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
  hint: { color: "#a0b4b6", fontSize: 12, textAlign: "center" }
});
