import type { NavigatorScreenParams } from "@react-navigation/native";
import type { RequiredPhotoAngle } from "@inspectiq/shared";

export type MainTabParamList = {
  Home: undefined;
  Queue: undefined;
  Review: undefined;
  Damage: undefined;
  Reports: undefined;
  Audit: undefined;
  Health: undefined;
  Uploads: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  InspectionDetail: { inspectionId: string };
  Capture: { inspectionId: string; initialAngle?: RequiredPhotoAngle };
  NewInspection: undefined;
  ReportEditor: { inspectionId: string };
};
