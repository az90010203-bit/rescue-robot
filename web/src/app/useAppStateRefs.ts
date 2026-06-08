import { useRef, useState } from "react";
import type { WebSerialClient } from "@adapters/web-serial/serial";
import type { ArmTeachTrack } from "@domains/arm/armTeach";
import type { ServoSmoothPreset } from "@domains/servo/servoMotion";
import type { ServoSafetyPreset } from "@domains/servo/servoSafety";
import type { DataProject } from "@adapters/data-service/dataService";
import {
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_MOTORS,
  DEFAULT_SERVOS,
  createDefaultArmConfig,
  type ArmConfig,
  type CameraConfig,
  type MotorLinkageGroup,
  type ServoLinkageGroup,
  type ServoLinkageWheelDirection,
  type ValidationErrorKey
} from "@adapters/persistence/storage";
import type { MotorProfile, MotorStopMode, MotorTarget, ServoProfile } from "@adapters/hardware/protocol";
import {
  type ActiveModule,
  type AboardBridgeStatus,
  type AppSection,
  type ArmTeachRuntime,
  type ArmTeachStatus,
  type ConnectionMode,
  type DatabaseSaveStatus,
  type MotorDebugHandshakeStatus,
  type MotorErrorDisplay,
  type MotorFeedbackMap,
  type MotorTestBoard,
  type PendingCommandResponse,
  type PendingDebugSet,
  type PendingLiveAngleMove,
  type PendingLiveWheelMove,
  type PendingSingleMotorMove,
  type PiServoBridgeStatus,
  type ServoCommandStateMap,
  type ServoFeedbackMap,
  type ServoMotionStatusMap,
  type ServoSafetyMonitor,
  type ServoSafetyStatusMap,
  type TestPanel,
  type WheelTurnProgress,
  defaultMotorDraft,
  defaultServoDraft
} from "@app/appModel";

export function useAppStateRefs() {
  const [activeSection, setActiveSection] = useState<AppSection>("console");
  const [activeTest, setActiveTest] = useState<TestPanel>("servo");
  const [activeModule, setActiveModule] = useState<ActiveModule>("camera");
  const [servos, setServos] = useState<ServoProfile[]>(() => DEFAULT_SERVOS);
  const [armConfig, setArmConfig] = useState<ArmConfig>(() => createDefaultArmConfig(DEFAULT_SERVOS));
  const [armTeachTracks, setArmTeachTracks] = useState<ArmTeachTrack[]>([]);
  const [selectedArmTeachTrackId, setSelectedArmTeachTrackId] = useState<string | null>(null);
  const [armTeachStatus, setArmTeachStatus] = useState<ArmTeachStatus>("idle");
  const [armTeachDraftName, setArmTeachDraftName] = useState("");
  const [armTeachDraftNotes, setArmTeachDraftNotes] = useState("");
  const [armTeachElapsedMs, setArmTeachElapsedMs] = useState(0);
  const [armTeachSampleCount, setArmTeachSampleCount] = useState(0);
  const [armTeachLastSampleStatus, setArmTeachLastSampleStatus] = useState("idle");
  const [armTeachUnsavedTrack, setArmTeachUnsavedTrack] = useState<ArmTeachTrack | null>(null);
  const [servoLinkageGroups, setServoLinkageGroups] = useState<ServoLinkageGroup[]>([]);
  const [motors, setMotors] = useState<MotorProfile[]>(() => DEFAULT_MOTORS);
  const [motorLinkageGroups, setMotorLinkageGroups] = useState<MotorLinkageGroup[]>([]);
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(() => DEFAULT_CAMERA_CONFIG);
  const [servoDraft, setServoDraft] = useState(defaultServoDraft);
  const [motorDraft, setMotorDraft] = useState(defaultMotorDraft);
  const [servoLibraryError, setServoLibraryError] = useState<ValidationErrorKey | null>(null);
  const [motorLibraryError, setMotorLibraryError] = useState<ValidationErrorKey | null>(null);
  const [motorConfigError, setMotorConfigError] = useState<ValidationErrorKey | null>(null);
  const [cameraConfigError, setCameraConfigError] = useState<ValidationErrorKey | null>(null);
  const [cameraStreamLoaded, setCameraStreamLoaded] = useState(false);
  const [cameraStreamFailed, setCameraStreamFailed] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [motorDebugHandshakeStatus, setMotorDebugHandshakeStatusState] = useState<MotorDebugHandshakeStatus>("unknown");
  const [lastMotorError, setLastMotorError] = useState<MotorErrorDisplay | null>(null);
  const [motorTestBoard, setMotorTestBoard] = useState<MotorTestBoard>("arduino");
  const [aBoardBridgeStatus, setABoardBridgeStatus] = useState<AboardBridgeStatus>("idle");
  const [aBoardBridgeError, setABoardBridgeError] = useState<string | null>(null);
  const [aBoardBridgeDetail, setABoardBridgeDetail] = useState("");
  const [piServoBridgeStatus, setPiServoBridgeStatus] = useState<PiServoBridgeStatus>("idle");
  const [piServoBridgeError, setPiServoBridgeError] = useState<string | null>(null);
  const [piServoBridgeDetail, setPiServoBridgeDetail] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [servoCommandById, setServoCommandById] = useState<ServoCommandStateMap>({});
  const [servoSmoothingEnabled, setServoSmoothingEnabled] = useState(true);
  const [servoSmoothPreset, setServoSmoothPreset] = useState<ServoSmoothPreset>("standard");
  const [servoMotionStatusById, setServoMotionStatusById] = useState<ServoMotionStatusMap>({});
  const [servoSafetyEnabled, setServoSafetyEnabled] = useState(true);
  const [servoSafetyPreset, setServoSafetyPreset] = useState<ServoSafetyPreset>("standard");
  const [servoSafetyStatusById, setServoSafetyStatusById] = useState<ServoSafetyStatusMap>({});
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseSaveStatus>("loading");
  const [currentProject, setCurrentProject] = useState<DataProject | null>(null);
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [lastDatabaseSavedAt, setLastDatabaseSavedAt] = useState<number | null>(null);
  const [databaseErrorMessage, setDatabaseErrorMessage] = useState("");
  const [expandedServoLinkageGroupIds, setExpandedServoLinkageGroupIds] = useState<Set<string>>(() => new Set());
  const [expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds] = useState<Set<string>>(() => new Set());
  const [linkageWheelDirectionByGroup, setLinkageWheelDirectionByGroup] = useState<Record<string, ServoLinkageWheelDirection | "paused">>({});
  const [motorSpeed, setMotorSpeed] = useState("0");
  const [stopMode, setStopMode] = useState<MotorStopMode>("coast");
  const [servoFeedback, setServoFeedback] = useState<ServoFeedbackMap>({});
  const [wheelTurnProgress, setWheelTurnProgress] = useState<Record<string, WheelTurnProgress>>({});
  const [motorFeedback, setMotorFeedback] = useState<MotorFeedbackMap>({});
  const serialRef = useRef<WebSerialClient | null>(null);
  const seqRef = useRef(1);
  const driveTargetsRef = useRef<MotorTarget[]>([]);
  const lastDriveCommandRef = useRef("");
  const servoSerialQueueRef = useRef<Promise<void>>(Promise.resolve());
  const liveAngleTimerRef = useRef<Record<number, number>>({});
  const liveAngleSendingRef = useRef<Record<number, boolean>>({});
  const pendingLiveAngleRef = useRef<Record<number, PendingLiveAngleMove>>({});
  const liveWheelTimerRef = useRef<Record<number, number>>({});
  const liveWheelSendingRef = useRef<Record<number, boolean>>({});
  const pendingLiveWheelRef = useRef<Record<number, PendingLiveWheelMove>>({});
  const armLiveTimerRef = useRef<number | undefined>(undefined);
  const armLiveSendingRef = useRef(false);
  const pendingArmConfigRef = useRef<ArmConfig | null>(null);
  const draggingArmJointIdRef = useRef<string | null>(null);
  const armTeachTimerRef = useRef<number | undefined>(undefined);
  const armTeachRuntimeRef = useRef<ArmTeachRuntime | null>(null);
  const armTeachPlaybackGenerationRef = useRef(0);
  const linkageLiveTimerRef = useRef<Record<string, number>>({});
  const linkageLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingLinkageMoveRef = useRef<Record<string, ServoLinkageGroup>>({});
  const servoLinkageGroupsRef = useRef<ServoLinkageGroup[]>([]);
  const motorLinkageLiveTimerRef = useRef<Record<string, number>>({});
  const motorLinkageLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingMotorLinkageMoveRef = useRef<Record<string, MotorLinkageGroup>>({});
  const motorLinkageGroupsRef = useRef<MotorLinkageGroup[]>([]);
  const motorLinkageGenerationRef = useRef<Record<string, number>>({});
  const singleMotorLiveTimerRef = useRef<number | undefined>(undefined);
  const singleMotorLiveSendingRef = useRef(false);
  const pendingSingleMotorMoveRef = useRef<PendingSingleMotorMove | null>(null);
  const singleMotorGenerationRef = useRef(0);
  const motorSerialQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastMotorSpeedByChannelRef = useRef<Record<string, number>>({});
  const pendingCommandResponseBySeqRef = useRef<Map<number, PendingCommandResponse>>(new Map());
  const servoMotionGenerationRef = useRef<Record<string, number>>({});
  const lastServoPhysicalAngleRef = useRef<Record<number, number>>({});
  const lastServoWheelSpeedRef = useRef<Record<number, number>>({});
  const servoSafetyTimerRef = useRef<Record<number, number>>({});
  const servoSafetyMonitorRef = useRef<Record<number, ServoSafetyMonitor>>({});
  const servoSafetySettingsRef = useRef<{ enabled: boolean; preset: ServoSafetyPreset }>({ enabled: true, preset: "standard" });
  const livePositionModeServoRef = useRef<Set<number>>(new Set());
  const databaseLoadedRef = useRef(false);
  const databaseSaveTimerRef = useRef<number | undefined>(undefined);
  const currentProjectIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const motorDebugHandshakeStatusRef = useRef<MotorDebugHandshakeStatus>("unknown");
  const motorDebugHandshakePromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingDebugSetBySeqRef = useRef<Map<number, PendingDebugSet>>(new Map());
  return {
    activeSection, setActiveSection, activeTest, setActiveTest, activeModule, setActiveModule,
    servos, setServos, armConfig, setArmConfig, armTeachTracks, setArmTeachTracks, selectedArmTeachTrackId, setSelectedArmTeachTrackId,
    armTeachStatus, setArmTeachStatus, armTeachDraftName, setArmTeachDraftName, armTeachDraftNotes, setArmTeachDraftNotes,
    armTeachElapsedMs, setArmTeachElapsedMs, armTeachSampleCount, setArmTeachSampleCount, armTeachLastSampleStatus, setArmTeachLastSampleStatus,
    armTeachUnsavedTrack, setArmTeachUnsavedTrack, servoLinkageGroups, setServoLinkageGroups, motors, setMotors, motorLinkageGroups,
    setMotorLinkageGroups, cameraConfig, setCameraConfig, servoDraft, setServoDraft, motorDraft, setMotorDraft, servoLibraryError,
    setServoLibraryError, motorLibraryError, setMotorLibraryError, motorConfigError, setMotorConfigError, cameraConfigError,
    setCameraConfigError, cameraStreamLoaded, setCameraStreamLoaded, cameraStreamFailed, setCameraStreamFailed, debugEnabled,
    setDebugEnabled, motorDebugHandshakeStatus, setMotorDebugHandshakeStatusState, lastMotorError, setLastMotorError, motorTestBoard,
    setMotorTestBoard, aBoardBridgeStatus,
    setABoardBridgeStatus, aBoardBridgeError, setABoardBridgeError, aBoardBridgeDetail, setABoardBridgeDetail,
    piServoBridgeStatus, setPiServoBridgeStatus, piServoBridgeError, setPiServoBridgeError, piServoBridgeDetail, setPiServoBridgeDetail, connected,
    setConnected, connectionMode, setConnectionMode, selectedId, setSelectedId, selectedChannel, setSelectedChannel, servoCommandById,
    setServoCommandById, servoSmoothingEnabled, setServoSmoothingEnabled, servoSmoothPreset, setServoSmoothPreset, servoMotionStatusById,
    setServoMotionStatusById, servoSafetyEnabled, setServoSafetyEnabled, servoSafetyPreset, setServoSafetyPreset, servoSafetyStatusById,
    setServoSafetyStatusById, databaseStatus, setDatabaseStatus, currentProject, setCurrentProject, projects, setProjects, newProjectName,
    setNewProjectName, lastDatabaseSavedAt, setLastDatabaseSavedAt, databaseErrorMessage, setDatabaseErrorMessage, expandedServoLinkageGroupIds,
    setExpandedServoLinkageGroupIds, expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds, linkageWheelDirectionByGroup,
    setLinkageWheelDirectionByGroup, motorSpeed, setMotorSpeed, stopMode, setStopMode, servoFeedback, setServoFeedback, wheelTurnProgress,
    setWheelTurnProgress, motorFeedback, setMotorFeedback, serialRef, seqRef, driveTargetsRef, lastDriveCommandRef, servoSerialQueueRef,
    liveAngleTimerRef, liveAngleSendingRef, pendingLiveAngleRef, liveWheelTimerRef, liveWheelSendingRef, pendingLiveWheelRef, armLiveTimerRef,
    armLiveSendingRef, pendingArmConfigRef, draggingArmJointIdRef, armTeachTimerRef, armTeachRuntimeRef, armTeachPlaybackGenerationRef,
    linkageLiveTimerRef, linkageLiveSendingRef, pendingLinkageMoveRef, servoLinkageGroupsRef, motorLinkageLiveTimerRef,
    motorLinkageLiveSendingRef, pendingMotorLinkageMoveRef, motorLinkageGroupsRef, motorLinkageGenerationRef, singleMotorLiveTimerRef,
    singleMotorLiveSendingRef, pendingSingleMotorMoveRef, singleMotorGenerationRef, motorSerialQueueRef, lastMotorSpeedByChannelRef,
    pendingCommandResponseBySeqRef, servoMotionGenerationRef, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, servoSafetyTimerRef,
    servoSafetyMonitorRef, servoSafetySettingsRef, livePositionModeServoRef, databaseLoadedRef, databaseSaveTimerRef, currentProjectIdRef,
    currentSessionIdRef, motorDebugHandshakeStatusRef, motorDebugHandshakePromiseRef, pendingDebugSetBySeqRef
  };
}
