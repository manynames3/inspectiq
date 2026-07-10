import { useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from "expo-camera";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { Check, RotateCcw, ShieldAlert } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { requiredPhotoAngles, type RequiredPhotoAngle } from "@inspectiq/shared";
import { prepareCapture } from "../capture/quality";
import { ActionButton, Notice, StatusPill } from "../components/Primitives";
import type { RootStackParamList } from "../navigation/types";
import { queueUploadOperation } from "../offline/database";
import { colors } from "../theme";
import type { UploadOperation } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

type Props = NativeStackScreenProps<RootStackParamList, "Capture">;

const labels: Record<RequiredPhotoAngle, string> = {
  front: "Front",
  rear: "Rear",
  driver_side: "Driver side",
  passenger_side: "Passenger side",
  interior: "Interior",
  engine_bay: "Engine bay",
  odometer: "Odometer",
  vin_plate: "VIN plate"
};

const guidance: Record<RequiredPhotoAngle, string> = {
  front: "Center the vehicle and keep both headlights level inside the frame.",
  rear: "Center the rear bumper and keep the camera square to the vehicle.",
  driver_side: "Show the complete driver side, wheels, and rocker panel.",
  passenger_side: "Show the complete passenger side, wheels, and rocker panel.",
  interior: "Capture the dashboard, steering wheel, front seats, and console.",
  engine_bay: "Open the hood and include the complete engine compartment.",
  odometer: "Fill the frame with the instrument display and avoid reflections.",
  vin_plate: "Fill the frame with the VIN label or plate and keep all characters sharp."
};

export function CaptureScreen({ route, navigation }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { bundleById, pendingUploads, online, syncNow, refresh } = useWorkspace();
  const bundle = bundleById(route.params.inspectionId);
  const completedAngles = useMemo(() => new Set([
    ...(bundle?.photos.map((photo) => photo.declaredAngle).filter(Boolean) ?? []),
    ...pendingUploads.filter((operation) => operation.inspectionId === route.params.inspectionId && operation.status !== "blocked").map((operation) => operation.declaredAngle)
  ]), [bundle, pendingUploads, route.params.inspectionId]);
  const initial = route.params.initialAngle ?? requiredPhotoAngles.find((angle) => !completedAngles.has(angle)) ?? "front";
  const [angle, setAngle] = useState<RequiredPhotoAngle>(initial);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [candidate, setCandidate] = useState<UploadOperation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const takePhoto = async () => {
    if (!camera.current || !ready || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const result: CameraCapturedPicture | undefined = await camera.current.takePictureAsync({
        quality: 1,
        exif: false,
        skipProcessing: false,
        shutterSound: true
      });
      if (!result) throw new Error("Camera did not return a photo.");
      const operation = await prepareCapture({
        sourceUri: result.uri,
        sourceWidth: result.width,
        sourceHeight: result.height,
        inspectionId: route.params.inspectionId,
        angle,
        operationId: Crypto.randomUUID()
      });
      setCandidate(operation);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Capture failed.");
    } finally {
      setProcessing(false);
    }
  };

  const discardCandidate = () => {
    if (candidate) {
      const file = new File(candidate.fileUri);
      if (file.exists) file.delete();
    }
    setCandidate(null);
  };

  const queueCandidate = async (allowQaReview = false) => {
    if (!candidate) return;
    const queued: UploadOperation = {
      ...candidate,
      status: "queued",
      lastError: allowQaReview && candidate.quality.retakeRequired
        ? `Inspector retained for QA review: ${candidate.quality.guidance.join(" ")}`
        : null
    };
    await queueUploadOperation(queued);
    setCandidate(null);
    await refresh();
    if (online) await syncNow();
    const next = requiredPhotoAngles.find((requiredAngle) => requiredAngle !== angle && !completedAngles.has(requiredAngle));
    if (next) setAngle(next);
    else navigation.goBack();
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permission}>
        <ShieldAlert size={34} color={colors.blue} />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionCopy}>InspectIQ stores captures inside the application sandbox until upload is confirmed.</Text>
        <ActionButton label="Allow camera" onPress={() => void requestPermission()} />
      </View>
    );
  }

  if (candidate) {
    return (
      <ScrollView style={styles.reviewScreen} contentContainerStyle={styles.reviewContent}>
        <Image source={{ uri: candidate.fileUri }} style={styles.reviewImage} resizeMode="contain" />
        <View style={styles.reviewHeading}>
          <Text style={styles.reviewTitle}>{labels[candidate.declaredAngle]}</Text>
          <StatusPill label={candidate.quality.retakeRequired ? "Retake recommended" : "Preflight passed"} tone={candidate.quality.retakeRequired ? "warn" : "good"} />
        </View>
        <View style={styles.qualityRow}>
          <StatusPill label={`${candidate.width}×${candidate.height}`} tone={candidate.quality.resolutionOk ? "good" : "bad"} />
          <StatusPill label={`Exposure ${candidate.quality.exposureStatus}`} tone={candidate.quality.exposureStatus === "good" ? "good" : "warn"} />
          <StatusPill label={`Focus ${candidate.quality.blurStatus}`} tone={candidate.quality.blurStatus === "good" ? "good" : "warn"} />
        </View>
        {candidate.quality.guidance.length ? <Notice tone="warn" title="Retake guidance" message={candidate.quality.guidance.join(" ")} /> : null}
        <ActionButton label={candidate.quality.retakeRequired ? "Retake photo" : "Queue upload"} icon={candidate.quality.retakeRequired ? <RotateCcw size={18} color="white" /> : <Check size={18} color="white" />} onPress={candidate.quality.retakeRequired ? discardCandidate : () => void queueCandidate()} />
        {candidate.quality.retakeRequired ? <ActionButton label="Keep for QA review" tone="secondary" onPress={() => void queueCandidate(true)} /> : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={camera} style={styles.camera} facing="back" autofocus="on" onCameraReady={() => setReady(true)}>
        <View style={styles.cameraShade}>
          <View style={styles.cameraTop}>
            <Text style={styles.cameraTitle}>{labels[angle]}</Text>
            <Text style={styles.cameraGuidance}>{guidance[angle]}</Text>
          </View>
          <View style={[styles.overlay, (angle === "odometer" || angle === "vin_plate") && styles.overlayDetail]} />
          <View style={styles.cameraBottom}>
            {error ? <Text style={styles.captureError}>{error}</Text> : null}
            <Pressable disabled={!ready || processing} onPress={() => void takePhoto()} style={[styles.shutter, (!ready || processing) && styles.shutterDisabled]} accessibilityRole="button" accessibilityLabel={`Capture ${labels[angle]} photo`}>
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </View>
      </CameraView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.angleStrip}>
        {requiredPhotoAngles.map((option) => (
          <Pressable key={option} onPress={() => setAngle(option)} style={[styles.angleButton, angle === option && styles.angleButtonActive]}>
            {completedAngles.has(option) ? <Check size={13} color={angle === option ? "white" : colors.teal} /> : null}
            <Text style={[styles.angleText, angle === option && styles.angleTextActive]}>{labels[option]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraShade: { flex: 1, justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.08)", padding: 20 },
  cameraTop: { backgroundColor: "rgba(7,28,44,0.82)", borderRadius: 8, padding: 12, gap: 4 },
  cameraTitle: { color: "white", fontSize: 20, fontWeight: "800" },
  cameraGuidance: { color: "#DCE8F4", fontSize: 13, lineHeight: 18 },
  overlay: { position: "absolute", left: "8%", right: "8%", top: "29%", height: "38%", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 18 },
  overlayDetail: { left: "14%", right: "14%", top: "37%", height: "23%", borderRadius: 7 },
  cameraBottom: { alignItems: "center", gap: 8 },
  captureError: { color: "white", backgroundColor: "rgba(173,20,26,0.85)", padding: 8, borderRadius: 6 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "white", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "white" },
  shutterDisabled: { opacity: 0.45 },
  angleStrip: { minHeight: 70, backgroundColor: colors.navy, paddingHorizontal: 10, alignItems: "center", gap: 8 },
  angleButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#486176", borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  angleButtonActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  angleText: { color: "#DCE8F4", fontSize: 12, fontWeight: "700" },
  angleTextActive: { color: "white" },
  reviewScreen: { flex: 1, backgroundColor: colors.canvas },
  reviewContent: { padding: 16, gap: 14 },
  reviewImage: { width: "100%", aspectRatio: 4 / 3, backgroundColor: "#111" },
  reviewHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  reviewTitle: { flex: 1, color: colors.ink, fontSize: 22, fontWeight: "800" },
  qualityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  permission: { flex: 1, justifyContent: "center", padding: 28, gap: 14, backgroundColor: colors.canvas },
  permissionTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  permissionCopy: { color: colors.muted, fontSize: 15, lineHeight: 21 }
});
