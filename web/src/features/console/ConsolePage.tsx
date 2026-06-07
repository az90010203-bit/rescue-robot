import type { PointerEvent as ReactPointerEvent } from "react";
import type { TFunction } from "i18next";
import type { DataProject } from "../../lib/dataService";
import type { DriveInputState } from "../../lib/drive";
import type { ImuAttitude, ImuCalibration, ImuCalibrationStatus, ImuFeedback } from "../../lib/imuAttitude";
import type { LogEntry } from "../../app/appModel";
import type { PiRemoteRuntime } from "../../app/usePiRemote";
import type { PluginInstance } from "../../platform/architecture";
import type { ArmConfig, ArmSegmentPose, CameraConfig, CameraVideoSource } from "../../lib/storage";
import type { CameraSourceRuntimeStatus } from "../drive/cameraSources";
import { ConsoleDashboard } from "./ConsoleDashboard";

interface ConsolePageProps {
  aBoardBridgeBusy: boolean;
  aBoardBridgeConnected: boolean;
  aBoardImuAttitude: ImuAttitude | null;
  aBoardImuCalibration: ImuCalibration;
  aBoardImuCalibrationStatus: ImuCalibrationStatus;
  aBoardImuError: string | null;
  aBoardImuFeedback: ImuFeedback | null;
  checkAboardSerialBridge: () => Promise<unknown>;
  activeDriveBase: "tracked" | "mecanum";
  activeGamepad: { index: number } | null;
  activeSectionLabel: string;
  architecturePluginInstances: PluginInstance[];
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  cameraConfig: CameraConfig;
  cameraPreviewCommand: string;
  cameraSourceRuntimeById: Record<string, CameraSourceRuntimeStatus>;
  cameraStreamReloadToken: number;
  cameraVideoSources: CameraVideoSource[];
  completeMotorMappingCount: number;
  connected: boolean;
  currentProject: DataProject | null;
  dataServiceOnline: boolean;
  driveCanCommand: boolean;
  driveInput: DriveInputState;
  drivePreviewCommand: string;
  handleVirtualStickDown: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  handleVirtualStickMove: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  logs: LogEntry[];
  motorCount: number;
  piRemote: PiRemoteRuntime;
  resetVirtualStick: (kind: "camera" | "drive") => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  servoCount: number;
  servoFeedback: Record<string, any>;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  startAboardImuCalibration: () => void;
  stopAllMotors: () => void;
  t: TFunction;
}

export function ConsolePage(props: ConsolePageProps) {
  return <ConsoleDashboard {...props} />;
}
