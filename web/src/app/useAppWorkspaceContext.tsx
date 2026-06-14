import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCameraSettings } from "@domains/camera/useCameraSettings";
import { useCameraGimbalRuntime } from "@domains/camera/useCameraGimbalRuntime";
import { useCameraSourceRuntime } from "@domains/camera/useCameraSourceRuntime";
import { useMotorLibrary } from "@domains/motor/useMotorLibrary";
import { useMotorLinkageRuntime } from "@domains/motor/useMotorLinkageRuntime";
import { useSingleMotorRuntime } from "@domains/motor/useSingleMotorRuntime";
import { useServoActionsRuntime } from "@domains/servo/useServoActionsRuntime";
import { useServoLibrary } from "@domains/servo/useServoLibrary";
import { useServoLinkageRuntime } from "@domains/servo/useServoLinkageRuntime";
import { useServoCommandRuntime } from "@domains/servo/useServoCommandRuntime";
import { useServoMotionCore } from "@domains/servo/useServoMotionCore";
import { useServoMotionRuntime } from "@domains/servo/useServoMotionRuntime";
import { useServoPauseRuntime } from "@domains/servo/useServoPauseRuntime";
import { useServoSafetyRuntime } from "@domains/servo/useServoSafetyRuntime";
import { useServoWheelTurnRuntime } from "@domains/servo/useServoWheelTurnRuntime";
import { useAppLogs } from "@app/useAppLogs";
import { useArmMotionRuntime } from "@domains/arm/useArmMotionRuntime";
import { useArmRuntime } from "@domains/arm/useArmRuntime";
import { useArmTeachRuntime } from "@domains/arm/useArmTeachRuntime";
import { useFirmwareRuntime } from "@adapters/firmware/useFirmwareRuntime";
import { useDriveInput } from "@domains/drive/useDriveInput";
import { usePiRemote } from "@adapters/pi/usePiRemote";
import { usePlatformCommands } from "@platform/usePlatformCommands";
import { usePlatformRuntime } from "@platform/usePlatformRuntime";
import { useAppPersistenceActions } from "@app/useAppPersistenceActions";
import { useAppPersistenceEffects } from "@app/useAppPersistenceEffects";
import { useAppCancellationRuntime } from "@app/useAppCancellationRuntime";
import { useSerialConnectionRuntime } from "@adapters/web-serial/useSerialConnectionRuntime";
import { useServoSerialTransport, type ServoFrameSendOptions } from "@adapters/web-serial/useServoSerialTransport";
import { useAppNavigation } from "@app/useAppNavigation";
import { useFeedbackRuntime } from "@platform/useFeedbackRuntime";
import { useAppRuntimeEffects } from "@app/useAppRuntimeEffects";
import { useDisplayFormatters } from "@app/useDisplayFormatters";
import { useAppStateRefs } from "@app/useAppStateRefs";
import { servoRealtimeFeedbackFromResponse } from "@app/servoRealtimeFeedback";
import { useAboardImuPollingRuntime } from "@app/useAboardImuPollingRuntime";
import { useAiVisionRuntime } from "@domains/ai-vision/useAiVisionRuntime";
import { useCanServoGamepadRuntime } from "@domains/can-servo/useCanServoGamepadRuntime";
import {
  DEFAULT_BOOT_SELF_CHECK_GATE,
  pcCommandIsDangerous,
  type BootSelfCheckGateState
} from "@domains/boot-self-check/bootSelfCheck";
import { useBootSelfCheckRuntime } from "@domains/boot-self-check/useBootSelfCheckRuntime";
import { useDiagnosticAgentRuntime } from "@domains/diagnostic-agent/useDiagnosticAgentRuntime";
import { createArmCanvasRenderer, createPlatformPanelRenderer } from "@app/createWorkspaceRenderers";
import { createAppPlatformCommandDispatcher } from "@app/appPlatformCommandBridge";
import { useArchitectureRuntime } from "@workspaces/architecture/useArchitectureRuntime";
import { DebugModule, FeetechStatusPacket, InboundMessage, MotorDirection, MotorProfile, MotorStopMode, MotorTarget, PcCommand, ServoProfile, DEFAULT_WHEEL_SPEED_LIMIT, applyServoWheelDirection, buildDebugSetCommand, buildMotorConfigCommand, buildMotorSetCommand, buildMotorStopCommand, buildPingFrame, buildReadFeedbackFrame, buildServoMoveCommand, buildWheelModeSetupFrames, buildWriteSpeedFrames, clamp, clampServoLogicalAngle, isServoDebugDisabledError, motorDirectionFromSpeed, normalizeMotorChannel, normalizeServoProfile, servoLogicalSpan, servoLogicalToPhysicalAngle, servoPhysicalToLogicalAngleWithReverse, toHex } from "@adapters/hardware/protocol";
import { AppConfigSnapshot, AppStateSnapshotV2, createAppConfigSnapshot, createAppStateSnapshotV2, loadOrMigrateAppConfigSnapshot, normalizeAppStateSnapshotV2, saveAppDatabaseSnapshot, PersistedActiveModule, PersistedLogEntry, PersistedServoCommandMap } from "@adapters/persistence/appDatabase";
import { DataProject, DataTelemetryEntry, CurrentProjectState, appendEvents, appendTelemetry, checkDataService, createProject, endSession, listArmTeachTracks, listComponents, listPluginInstances, listProjects, loadCurrentProjectState, saveProjectState, selectProject, startSession } from "@adapters/data-service/dataService";
import { createArmTuningProbeSequence } from "@domains/arm/armKinematics";
import { ArmTeachTrack, normalizeArmTeachTracks } from "@domains/arm/armTeach";
import { ServoSmoothPreset, resolveServoMotionConfig } from "@domains/servo/servoMotion";
import { ServoSafetyPreset, ServoSafetyTriggerReason, resolveServoSafetyConfig } from "@domains/servo/servoSafety";
import { WHEEL_SLIDER_CENTER_DEG, WHEEL_SLIDER_MAX_DEG, WHEEL_SLIDER_MIN_DEG, clampWheelSliderDeg, commandSpeedRawToWheelSliderDeg, normalizeWheelMaxSpeedRaw, wheelSliderDirection, wheelSliderToCommandSpeedRaw } from "@domains/servo/servoWheelSlider";
import { DEFAULT_DRIVE_CHANNELS, DriveBase, DriveInputState, ZERO_DRIVE_INPUT, combineDriveInputs, mixDriveTargets } from "@domains/drive/drive";
import { ControlAction, DEFAULT_INPUT_MAPPING, GamepadPresetId, InputMapping, cloneMapping, getGamepadPresetMapping, gamepadInputFromGamepad, isCustomGamepadMapping, keyboardInputFromPressedKeys, normalizeInputMapping, resolveGamepadPreset } from "@domains/drive/inputMapping";
import { WebSerialClient } from "@adapters/web-serial/serial";
import { ArmConfig, ArmJointConfig, ArmSegmentPose, CameraConfig, DEFAULT_CAMERA_CONFIG, DEFAULT_LINKAGE_MEMBER_ACC, DEFAULT_LINKAGE_MEMBER_SPEED_RAW, DEFAULT_LINKAGE_WHEEL_TURNS_TARGET, DEFAULT_MOTORS, DEFAULT_SERVOS, MotorLinkageGroup, ServoLinkageGroup, ServoLinkageWheelDirection, ValidationErrorKey, calculateArmSegmentPoses, calculateMotorLinkageTargets, calculateServoLinkageTargets, calculateServoLinkageWheelTargets, createDefaultArmConfig, validateCameraConfig, validateMotorMapping } from "@adapters/persistence/storage";
import { defaultLanguage, isSupportedLanguage } from "../i18n/languages";
import { PiExecResult, PiCameraCheckResult, PiHelperHealth, PiReadinessResult, PiRunPlan, PiSetupProfile, PiUploadResult, checkPiCamera, checkPiReadiness, createPiRunPlan, execPiCommand, installPiCameraTools, isPiRemoteError, requestPiHelperHealth, runUploadedFile, startPiCameraStream, stopPiCameraStream, setupPiWorkspace, testPiConnection, uploadPiFile } from "@adapters/pi/piRemote";
import { checkAboardBridge, sendAboardBridgeCommand, startAboardBridge, type AboardBridgeCommandResult, type AboardBridgeHealth } from "@adapters/pi/piAboardBridge";
import { checkPiServoBridge, sendPiServoBridgeCommand as sendPiServoBridgeCommandRequest, startPiServoBridge, type PiServoBridgeHealth } from "@adapters/pi/piServoBridge";
import { shouldAutoCheckAboardBridge, shouldAutoCheckPiServoBridgeContext, shouldAutoRecoverBridge } from "@adapters/pi/aBoardBridgeAutoCheck";
import { isLatestWinsAboardBatch, shouldClearPendingAboardMotion } from "@adapters/pi/aBoardCommandScheduling";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";
import {
  beginImuCalibration,
  calculateImuAttitude,
  createDefaultImuCalibration,
  imuCalibrationStatus,
  updateImuCalibration,
  type ImuAttitude,
  type ImuCalibration,
  type ImuFeedback
} from "@domains/drive/imuAttitude";
import { createPlatformCommand, type PlatformCommand, type PlatformCommandResult } from "@platform/commands";
import { createPlatformStateSnapshot } from "@platform/stateStore";
import { findPlatformUiPanelForDevice, formatPlatformStateValue, limitPlatformEvents, platformControlDefaultsForDevice, PlatformControlDraft, resolveSelectedPlatformDeviceId } from "@platform/ui";
import { ActiveModule, AppSection, ArmMotionTarget, ArmTeachRuntime, ArmTeachStatus, ConnectionMode, DatabaseSaveStatus, FirmwareUploadStatus, GamepadSummary, MotorErrorDisplay, MotorFeedbackMap, PendingLiveAngleMove, PendingLiveWheelMove, PendingSingleMotorMove, PI_SETUP_PROFILE_STORAGE_KEY, ServoCommandState, ServoCommandStateMap, ServoControlMode, ServoFeedbackMap, ServoMotionDisplayStatus, ServoMotionStatusMap, ServoSafetyDisplayStatus, ServoSafetyMonitor, ServoSafetyStatusMap, TestPanel, WheelTurnProgress, clampServoCommandStateToLimits, createDefaultServoCommandState, databaseStatusTone, debugModuleFor, defaultMotorDraft, defaultPiRemoteForm, defaultServoDraft, formatServoAngle, formatSignedPercent, getServoCommandState, isEditableTarget, isServoBusModule, linkageWheelTurnProgressKey, motorPinSummary, nextMotorDraft, nextMotorLinkageGroupName, nextServoLinkageGroupName, safeCameraGimbalCommandPreview, safeDriveCommandPreview, safeFramePreview, safeMotorCommandPreview, safeSpeedFramePreview, servoMotionStatusLabel, singleWheelTurnProgressKey } from "@app/appModel";

const BRIDGE_AUTO_RECOVER_DELAY_MS = 2000;
const PI_SERVO_BRIDGE_HEALTH_TIMEOUT_MS = 1200;
const PI_SERVO_BRIDGE_FRAME_TIMEOUT_PADDING_MS = 2600;
const PI_SERVO_BRIDGE_DEBUG_SET_TIMEOUT_MS = 1600;
const SERVO_REALTIME_AUTO_RETRY_MS = 1500;
const SERVO_REALTIME_UNAVAILABLE_RETRY_MS = 8000;

interface PendingAboardMotionBatch {
  commands: PcCommand[];
  options: { log?: boolean; shouldRun?: () => boolean };
  generation: number;
  resolve: (sent: boolean) => void;
}
interface AboardCommandOutcome {
  busy: boolean;
  result: AboardBridgeCommandResult | null;
  sent: boolean;
}
const A_BOARD_BUSY_RETRY_MS = 80;

export function useAppWorkspaceContext() {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : defaultLanguage;

  useEffect(() => {
    document.title = t("app.documentTitle", { defaultValue: t("app.title") });
  }, [currentLanguage, t]);

  const { activeSection, setActiveSection, activeTest, setActiveTest, activeModule, setActiveModule, servos, setServos, armConfig, setArmConfig, armTeachTracks, setArmTeachTracks, selectedArmTeachTrackId, setSelectedArmTeachTrackId, armTeachStatus, setArmTeachStatus, armTeachDraftName, setArmTeachDraftName, armTeachDraftNotes, setArmTeachDraftNotes, armTeachElapsedMs, setArmTeachElapsedMs, armTeachSampleCount, setArmTeachSampleCount, armTeachLastSampleStatus, setArmTeachLastSampleStatus, armTeachUnsavedTrack, setArmTeachUnsavedTrack, servoLinkageGroups, setServoLinkageGroups, motors, setMotors, motorLinkageGroups, setMotorLinkageGroups, cameraConfig, setCameraConfig, servoDraft, setServoDraft, motorDraft, setMotorDraft, servoLibraryError, setServoLibraryError, motorLibraryError, setMotorLibraryError, motorConfigError, setMotorConfigError, cameraConfigError, setCameraConfigError, cameraStreamLoaded, setCameraStreamLoaded, cameraStreamFailed, setCameraStreamFailed, debugEnabled, setDebugEnabled, lastMotorError, setLastMotorError, aBoardBridgeStatus, setABoardBridgeStatus, aBoardBridgeError, setABoardBridgeError, aBoardBridgeDetail, setABoardBridgeDetail, piServoBridgeStatus, setPiServoBridgeStatus, piServoBridgeError, setPiServoBridgeError, piServoBridgeDetail, setPiServoBridgeDetail, connected, setConnected, connectionMode, setConnectionMode, selectedId, setSelectedId, selectedChannel, setSelectedChannel, servoCommandById, setServoCommandById, servoSmoothingEnabled, setServoSmoothingEnabled, servoSmoothPreset, setServoSmoothPreset, servoMotionStatusById, setServoMotionStatusById, servoSafetyEnabled, setServoSafetyEnabled, servoSafetyPreset, setServoSafetyPreset, servoSafetyStatusById, setServoSafetyStatusById, databaseStatus, setDatabaseStatus, currentProject, setCurrentProject, projects, setProjects, newProjectName, setNewProjectName, lastDatabaseSavedAt, setLastDatabaseSavedAt, databaseErrorMessage, setDatabaseErrorMessage, expandedServoLinkageGroupIds, setExpandedServoLinkageGroupIds, expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds, linkageWheelDirectionByGroup, setLinkageWheelDirectionByGroup, motorSpeed, setMotorSpeed, stopMode, setStopMode, servoFeedback, setServoFeedback, wheelTurnProgress, setWheelTurnProgress, motorFeedback, setMotorFeedback, serialRef, seqRef, driveTargetsRef, lastDriveCommandRef, servoSerialQueueRef, liveAngleTimerRef, liveAngleSendingRef, pendingLiveAngleRef, liveWheelTimerRef, liveWheelSendingRef, pendingLiveWheelRef, armLiveTimerRef, armLiveSendingRef, pendingArmConfigRef, draggingArmJointIdRef, armTeachTimerRef, armTeachRuntimeRef, armTeachPlaybackGenerationRef, linkageLiveTimerRef, linkageLiveSendingRef, pendingLinkageMoveRef, servoLinkageGroupsRef, motorLinkageLiveTimerRef, motorLinkageLiveSendingRef, pendingMotorLinkageMoveRef, motorLinkageGroupsRef, motorLinkageGenerationRef, singleMotorLiveTimerRef, singleMotorLiveSendingRef, pendingSingleMotorMoveRef, singleMotorGenerationRef, servoMotionGenerationRef, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, wheelModeServoRef, servoSafetyTimerRef, servoSafetyMonitorRef, servoSafetySettingsRef, livePositionModeServoRef, databaseLoadedRef, databaseSaveTimerRef, currentProjectIdRef, currentSessionIdRef } = useAppStateRefs();
  const [aBoardImuFeedback, setABoardImuFeedback] = useState<ImuFeedback | null>(null);
  const [aBoardImuAttitude, setABoardImuAttitude] = useState<ImuAttitude | null>(null);
  const [aBoardImuCalibration, setABoardImuCalibration] = useState<ImuCalibration>(() => createDefaultImuCalibration());
  const [aBoardImuError, setABoardImuError] = useState<string | null>(null);
  const aBoardImuCalibrationRef = useRef(aBoardImuCalibration);
  const aBoardBridgeAutoCheckedHostRef = useRef("");
  const aBoardBridgeManualDisconnectRef = useRef(false);
  const piServoBridgeAutoCheckedHostRef = useRef("");
  const piServoBridgeHostRef = useRef("");
  const piServoBridgeManualDisconnectRef = useRef(false);
  const piServoBridgeHealthCheckInFlightRef = useRef(false);
  const servoRealtimePrimedAtRef = useRef<Record<number, number>>({});
  const servoRealtimeNoResponseAtRef = useRef<Record<number, number>>({});
  const servoRealtimeAutoPrimeKeyRef = useRef("");
  const bridgeManagementBusyRef = useRef(false);
  const aBoardCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const aBoardCommandInFlightRef = useRef(false);
  const aBoardBridgeBusyRef = useRef(false);
  const aBoardBridgeBusyUntilRef = useRef(0);
  const aBoardLastOkAtRef = useRef<number | null>(null);
  const aBoardMotionGenerationRef = useRef(0);
  const pendingAboardMotionBatchRef = useRef<PendingAboardMotionBatch | null>(null);
  const aBoardMotionBatchSendingRef = useRef(false);
  const bootSelfCheckGateRef = useRef<BootSelfCheckGateState>(DEFAULT_BOOT_SELF_CHECK_GATE);
  const [servoRealtimeRetryGeneration, setServoRealtimeRetryGeneration] = useState(0);
  useEffect(() => {
    aBoardImuCalibrationRef.current = aBoardImuCalibration;
  }, [aBoardImuCalibration]);
  const { formatDirectionLabel, formatLinkageMemberDirection, formatWheelSliderDirectionLabel, metricNumber, servoSafetyStatusLabel, servoSafetyStatusTone } = useDisplayFormatters({ servoSafetyEnabled, t });
  const {
    addLog,
    addSystemLog,
    clearFlushTimers,
    flushEventQueue,
    flushTelemetryQueue,
    logs,
    persistLogEntry,
    queueTelemetry,
    restoreLogEntries,
    setLogs
  } = useAppLogs({
    currentSessionIdRef,
    onDatabaseError: (error) => {
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    }
  });
  const selectedServo = useMemo(
    () => servos.find((servo) => servo.id === selectedId),
    [selectedId, servos]
  );
  const selectedMotor = useMemo(
    () => motors.find((motor) => motor.channel === selectedChannel),
    [motors, selectedChannel]
  );
  const enabledServoLinkageGroups = useMemo(
    () => servoLinkageGroups.filter((group) => group.enabled),
    [servoLinkageGroups]
  );
  const enabledMotorLinkageGroups = useMemo(
    () => motorLinkageGroups.filter((group) => group.enabled),
    [motorLinkageGroups]
  );
  const selectedArmJoint = useMemo(
    () => armConfig.joints.find((joint) => joint.id === armConfig.selectedJointId) ?? armConfig.joints[0],
    [armConfig]
  );
  const selectedArmTeachTrack = useMemo(
    () => armTeachTracks.find((track) => track.id === selectedArmTeachTrackId) ?? armTeachUnsavedTrack ?? armTeachTracks[0] ?? null,
    [armTeachTracks, armTeachUnsavedTrack, selectedArmTeachTrackId]
  );
  const armSegmentPoses = useMemo(
    () => calculateArmSegmentPoses(armConfig.joints, { x: 300, y: 250 }, armConfig.baseDirectionDeg ?? 0),
    [armConfig.baseDirectionDeg, armConfig.joints]
  );
  const selectedArmFeedback = selectedArmJoint ? servoFeedback[selectedArmJoint.servoId] : undefined;
  const numericMotorSpeed = Number(motorSpeed);
  const motorDuty = Number.isFinite(numericMotorSpeed) ? Math.abs(numericMotorSpeed) : 0;
  const motorDirection = Number.isFinite(numericMotorSpeed) ? motorDirectionFromSpeed(numericMotorSpeed) : "stopped";
  const motorPreviewCommand =
    selectedMotor && Number.isFinite(numericMotorSpeed)
      ? safeMotorCommandPreview(selectedMotor.channel, numericMotorSpeed, stopMode)
      : "";
  const aBoardBridgeConnected = aBoardBridgeStatus === "connected";
  const aBoardBridgeBusy = aBoardBridgeStatus === "checking" || aBoardBridgeStatus === "starting";
  const aBoardImuCalibrationStatus = imuCalibrationStatus(aBoardImuCalibration);
  const aBoardBridgeTone: "neutral" | "online" | "warning" | "danger" =
    aBoardBridgeStatus === "connected" ? "online" : aBoardBridgeStatus === "error" ? "danger" : aBoardBridgeBusy ? "warning" : "neutral";
  const aBoardBridgeLabel =
    aBoardBridgeStatus === "connected"
      ? t("status.online")
      : aBoardBridgeStatus === "checking" || aBoardBridgeStatus === "starting"
        ? t("status.syncing")
        : aBoardBridgeStatus === "error"
          ? t("status.error")
          : t("status.offline");
  const piServoBridgeConnected = piServoBridgeStatus === "connected";
  const piServoBridgeBusy = piServoBridgeStatus === "checking" || piServoBridgeStatus === "starting";
  const piServoBridgeTone: "neutral" | "online" | "warning" | "danger" =
    piServoBridgeStatus === "connected" ? "online" : piServoBridgeStatus === "error" ? "danger" : piServoBridgeBusy ? "warning" : "neutral";
  const piServoBridgeLabel =
    piServoBridgeStatus === "connected"
      ? t("status.online")
      : piServoBridgeStatus === "checking" || piServoBridgeStatus === "starting"
        ? t("status.syncing")
        : piServoBridgeStatus === "error"
          ? t("status.error")
          : t("status.offline");
  const servoBusReady = (connected && connectionMode === "servo-bus") || piServoBridgeConnected;
  const motorControllerReady = aBoardBridgeConnected;
  const {
    activeCameraRuntime,
    activeCameraSource,
    cameraReadyBySourceId,
    cameraSourceRuntimeById,
    cameraStreamReloadToken,
    cameraStreamUrl,
    cameraVideoSources,
    mainCameraReady,
    resetCameraSourceRuntime,
    setCameraSourceRuntime,
    setCameraStreamReloadToken
  } = useCameraSourceRuntime({ cameraConfig });
  const cameraValidationError = validateCameraConfig(cameraConfig);
  const cameraCanCommand = connected && debugEnabled && !cameraValidationError;
  const cameraPreviewCommand = cameraValidationError ? "" : safeCameraGimbalCommandPreview(cameraConfig);
  const {
    saveCameraSettings,
    updateCameraActiveSource,
    updateCameraLatencyProfile,
    updateCameraNumber,
    updateCameraSourcePort,
    updateCameraSourceText,
    updateCameraStreamMode,
    updateCameraText,
    updateCameraVideoLayout
  } = useCameraSettings({
    addSystemLog, cameraConfig, setCameraConfig, setCameraConfigError
  });
  const completeMotorMappingCount = useMemo(
    () => motors.filter((motor) => validateMotorMapping(motor) === null).length,
    [motors]
  );
  const [runtimeArchitectureComponents, setRuntimeArchitectureComponents] = useState<ComponentDefinition[]>([]);
  const [runtimeArchitecturePluginInstances, setRuntimeArchitecturePluginInstances] = useState<PluginInstance[]>([]);
  useEffect(() => {
    if (databaseStatus === "offline" || !currentProject?.id) {
      setRuntimeArchitectureComponents([]);
      setRuntimeArchitecturePluginInstances([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listPluginInstances(currentProject.id),
      listComponents(currentProject.id)
    ]).then(([nextPluginInstances, nextComponents]) => {
      if (cancelled) {
        return;
      }
      setRuntimeArchitecturePluginInstances(nextPluginInstances);
      setRuntimeArchitectureComponents(nextComponents);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, databaseStatus]);
  const driveRuntime = useDriveInput({
    addSystemLog,
    components: runtimeArchitectureComponents,
    pluginInstances: runtimeArchitecturePluginInstances,
    stopAllMotors
  });
  const {
    activeDriveBase,
    activeGamepad,
    applyGamepadPresetToDraft,
    capturingKey,
    driveInput,
    driveSpeedLimit,
    driveSetupMappings,
    driveTargets,
    gamepads,
    handleVirtualStickDown,
    handleVirtualStickMove,
    inputMapping,
    mappingDraft,
    recommendedGamepadPreset,
    resetMappingSettings,
    resetVirtualStick,
    saveMappingSettings,
    savedGamepadIsCustom,
    selectDriveBase,
    selectedGamepadIndex,
    selectedGamepadPreset,
    setActiveDriveBase,
    setCapturingKey,
    setDriveSpeedLimit,
    setInputMapping,
    setMappingDraft,
    setSelectedGamepadIndex,
    setSelectedGamepadPreset,
    speedLimitPercent,
    canServoGamepadAngle,
    updateGamepadAxis,
    updateGamepadButton,
    updateGamepadDeadzone,
    updateKeyboardMapping,
    virtualDriveInput
  } = driveRuntime;
  const firmwareRuntime = useFirmwareRuntime({
    addLog, addSystemLog, completeMotorMappingCount, connected, connectionMode, disconnectSerial, motors
  });
  const {
    canCompileFirmware,
    canUploadFirmware,
    checkFirmwareHelper,
    compileArduinoFirmware,
    firmwareBoard,
    firmwareBusy,
    firmwareError,
    firmwareHelperHealth,
    firmwareHelperLabel,
    firmwareHelperTone,
    firmwareHexLabel,
    firmwareJob,
    firmwareLogs,
    firmwarePorts,
    firmwareStatus,
    firmwareStatusTone,
    refreshFirmwarePorts,
    selectedFirmwarePort,
    setFirmwareBoard,
    setFirmwareJob,
    setFirmwareStatus,
    setSelectedFirmwarePort,
    uploadCompiledArduinoFirmware
  } = firmwareRuntime;
  const piRemote = usePiRemote({
    activeCameraSource,
    addLog,
    addSystemLog,
    cameraConfig,
    resetCameraSourceRuntime,
    setCameraConfig,
    setCameraStreamFailed,
    setCameraStreamLoaded,
    setCameraStreamReloadToken
  });
  const {
    canExecPiCommand,
    canRunPiFile,
    canSetupPiWorkspace,
    canTestPiConnection,
    canUploadAndExecPiFile,
    canUploadPiFile,
    canUsePiCamera,
    checkPiHelper,
    checkRaspberryPiCamera,
    clearPiCameraOutput,
    clearPiOutput,
    execRaspberryPiCommand,
    execRaspberryPiCommandWith,
    installRaspberryPiCameraTools,
    piAdvancedOpen,
    piCameraAdvancedOpen,
    piCameraBusy,
    piCameraCheck,
    piCameraError,
    piCameraExecResult,
    piCameraStatus,
    piCommandReady,
    piConnectionReady,
    piFileReady,
    piHelperHealth,
    piHelperLabel,
    piOutputLabel,
    piReadiness,
    piRemoteBusy,
    piRemoteError,
    piRemoteExecResult,
    piRemoteFile,
    piRemoteForm,
    piRemoteStatus,
    piRemoteStatusTone,
    piRemoteUploadResult,
    piRunPlan,
    piSetupComplete,
    runRaspberryPiFile,
    setPiAdvancedOpen,
    setPiCameraAdvancedOpen,
    setupRaspberryPiWorkspace,
    startRaspberryPiCameraStream,
    stopRaspberryPiCameraStream,
    testRaspberryPiConnection,
    updatePiRemoteField,
    updatePiRemoteFile,
    uploadAndExecRaspberryPiFile,
    uploadAndExecRaspberryPiFileWith,
    uploadRaspberryPiFileWith,
    uploadRaspberryPiFile
  } = piRemote;
  const drivePreviewCommand = safeDriveCommandPreview(driveTargets, stopMode);
  const driveCanCommand = motorControllerReady;
  const webSerialAvailable = typeof navigator !== "undefined" && Boolean(navigator.serial);
  const basePlatformState = useMemo(
    () =>
      createPlatformStateSnapshot({
        servoFeedback,
        motorFeedback,
        cameraConfig,
        armConfig,
        connected,
        connectionMode,
        cameraReady: mainCameraReady,
        cameraReadyBySourceId
      }),
    [armConfig, cameraConfig, cameraReadyBySourceId, connected, connectionMode, mainCameraReady, motorFeedback, servoFeedback]
  );
  const aiVision = useAiVisionRuntime({
    activeCameraSource,
    platformState: basePlatformState
  });
  const {
    platformCapabilityCount,
    platformDeviceCount,
    platformDevices,
    platformEventBusRef,
    platformEvents,
    platformState,
    platformStateCount,
    resolvedPlatformDeviceId,
    selectedPlatformControlDraft,
    selectedPlatformDevice,
    selectedPlatformState,
    selectedPlatformUiPanel,
    setSelectedPlatformDeviceId,
    updatePlatformControlDraft
  } = usePlatformRuntime({
    activeModule,
    armConfig,
    cameraConfig,
    cameraReady: mainCameraReady,
    cameraReadyBySourceId,
    connected: activeModule === "servo" || activeModule === "arm" ? servoBusReady : connected,
    connectionMode: piServoBridgeConnected && (activeModule === "servo" || activeModule === "arm") ? "servo-bus" : connectionMode,
    motorFeedback,
    motors,
    selectedChannel,
    selectedId,
    servoFeedback,
    servos,
    aiVisionHelperReady: aiVision.helperReady,
    aiVisionMode: aiVision.health?.mode ?? null,
    aiVisionSampleDir: aiVision.health?.sampleDir ?? null,
    aiVisionDetectionCount: aiVision.detections.length,
    aiVisionLastLabel: aiVision.detections[0]?.label ?? null,
    aiVisionLastConfidence: aiVision.detections[0]?.confidence ?? null,
    aiVisionLastCapturePath: aiVision.lastCaptureResult?.imagePath ?? null,
    aiVisionSourceId: activeCameraSource.id
  });
  const feedbackRuntime = useFeedbackRuntime({
    addLog, addSystemLog, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, platformEventBusRef, queueTelemetry, setMotorFeedback, setServoFeedback
  });
  const servoSerialTransport = useServoSerialTransport({
    addErrorLog,
    addLog,
    connected,
    connectionMode,
    piServoBridgeConnected,
    seqRef,
    sendPiServoBridgeCommand: sendPiServoBridgeCommandMessage,
    serialRef,
    servoSerialQueueRef
  });
  const { centerCamera, nudgeCamera, sendCameraGimbalMove } = useCameraGimbalRuntime({
    addSystemLog, cameraConfig, nextSeq, send: sendCameraGimbalCommand, setCameraConfig, setCameraConfigError
  });
  const { beginServoSafetyMonitor, cancelServoSafetyMonitor } = useServoSafetyRuntime({
    addSystemLog, rememberServoFeedback, sendServoFrame, servoBusConnected, servoSafetyMonitorRef, servoSafetySettingsRef, servoSafetyTimerRef, servos,
    setServoSafetyStatusById, t
  });
  const {
    bumpServoMotionGeneration,
    cancelServoMotion,
    cancelServoMotionForArm,
    cancelServoMotionForLinkage,
    cancelServoMotionForServo,
    getPositionMotionStartAngle,
    getWheelMotionStartSpeed,
    isServoMotionCurrent,
    motionKeyForArm,
    motionKeyForLinkage,
    motionKeyForServo,
    prepareServoPositionModeUnlocked,
    setServoMotionStatus,
    writeServoGroupPositionUnlocked,
    writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  } = useServoMotionCore({
    addSystemLog, armConfig, enqueueServoSerialTask, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, livePositionModeServoRef, wheelModeServoRef, nextSeq, sendServoCommandUnlocked, sendServoFrameUnlocked, servoBusConnected,
    servoFeedback, servoLinkageGroupsRef, servoMotionGenerationRef, setServoMotionStatusById
  });
  const cancellationRuntime = useAppCancellationRuntime({
    armLiveTimerRef, cancelServoMotionForArm, cancelServoMotionForLinkage, cancelServoMotionForServo, linkageLiveTimerRef, liveAngleTimerRef, liveWheelTimerRef, motorLinkageGenerationRef,
    motorLinkageGroupsRef, motorLinkageLiveTimerRef, pendingArmConfigRef, pendingLinkageMoveRef, pendingLiveAngleRef, pendingLiveWheelRef, pendingMotorLinkageMoveRef, pendingSingleMotorMoveRef,
    servoLinkageGroupsRef, servos, singleMotorGenerationRef, singleMotorLiveTimerRef
  });
  const serialConnectionRuntime = useSerialConnectionRuntime({
    activeModule, addErrorLog, addLog, addSystemLog, cancelArmLiveMove, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoMotion,
    cancelServoSafetyMonitor, debugEnabled, handleMessage, lastServoWheelSpeedRef, livePositionModeServoRef, wheelModeServoRef, platformEventBusRef, resetControllerRuntimeState, serialRef,
    servoSerialQueueRef, setConnected, setConnectionMode, stopAllMotors, webSerialAvailable, writeDebugSetToClient: writeControllerDebugSetToClient
  });
  const platformCommandsRuntime = usePlatformCommands({
    enqueueServoSerialTask, nextSeq, platformEventBusRef, rememberServoFeedback, sendAboardCommand, sendServoCommand, sendServoFrameUnlocked, sendServoFrames, servos, writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  });
  const emitPlatformCommandResult = platformCommandsRuntime.emitPlatformCommandResult;
  async function dispatchPlatformCommand(command: PlatformCommand) {
    if (command.type === "servo.read_feedback") {
      const result = await platformCommandsRuntime.dispatchPlatformCommand(command);
      const servoId = Number(command.targetDeviceId.replace("servo:", ""));
      const servo = servos.find((item) => item.id === servoId);
      const feedback = servoRealtimeFeedbackFromResponse(result.response);
      if (servo && feedback && syncServoRealtimeFeedbackToDrafts(servo, feedback, { syncArm: true })) {
        markServoRealtimeAvailable(servo.id);
        servoRealtimePrimedAtRef.current[servo.id] = Date.now();
      }
      return result;
    }
    if (command.type === "servo.set_position" || command.type === "servo.set_speed") {
      const servoId = Number(command.targetDeviceId.replace("servo:", ""));
      const servo = servos.find((item) => item.id === servoId);
      if (servo) {
        const live = command.payload.live === true;
        const wasPrimed = Boolean(servoRealtimePrimedAtRef.current[servo.id]);
        const zeroSpeedStop = command.type === "servo.set_speed" && Number(command.payload.speedRaw) === 0;
        if (zeroSpeedStop || (live && wasPrimed)) {
          return platformCommandsRuntime.dispatchPlatformCommand(command);
        }
        const feedback = await readServoRealtimeForDebug(servo, { quiet: command.payload.live === true, syncArm: true });
        if (!feedback) {
          const result: PlatformCommandResult = {
            commandId: command.id,
            deviceId: command.targetDeviceId,
            status: "timeout",
            message: `servo ${servo.id} current position read failed`
          };
          emitPlatformCommandResult(command, result);
          return result;
        }
        if (!wasPrimed && !zeroSpeedStop && !live) {
          const result: PlatformCommandResult = {
            commandId: command.id,
            deviceId: command.targetDeviceId,
            status: "skipped",
            message: `servo ${servo.id} current position synced; first target blocked`
          };
          emitPlatformCommandResult(command, result);
          return result;
        }
      }
    }
    return platformCommandsRuntime.dispatchPlatformCommand(command);
  }
  useCanServoGamepadRuntime({
    angleInput: canServoGamepadAngle,
    components: runtimeArchitectureComponents,
    dispatchPlatformCommand,
    enabled: motorControllerReady,
    nextSeq,
    pluginInstances: runtimeArchitecturePluginInstances
  });
  function hardwareGateBlocks(_label: string): boolean {
    return false;
  }
  const {
    cancelServoLinkageWheelTurnMonitors,
    cancelWheelTurnMonitor,
    startWheelTurnMonitor
  } = useServoWheelTurnRuntime({
    addSystemLog, rememberServoFeedback, sendServoFrame, setWheelTurnProgress
  });
  const { calculateArmMotionTargets, runArmPositionMotion: runArmPositionMotionUnsafe } = useArmMotionRuntime({
    addLog, addSystemLog, beginServoSafetyMonitor, bumpServoMotionGeneration, cancelServoMotionForArm, enqueueServoSerialTask, getPositionMotionStartAngle, isServoMotionCurrent,
    motionKeyForArm, pauseArm, servoBusConnected, servoSmoothPreset, servoSmoothingEnabled, servos, setServoMotionStatus, sleepMs,
    writeServoGroupPositionUnlocked, writeServoPositionUnlocked
  });
  const {
    addMotor,
    removeMotor,
    saveMotorMapping,
    sendMotorConfig,
    updateSelectedMotorMapping
  } = useMotorLibrary({
    addSystemLog, dispatchPlatformCommand, motorDraft, motors, selectedChannel, selectedMotor, setMotorConfigError, setMotorDraft,
    setMotorFeedback, setMotorLibraryError, setMotors, setSelectedChannel
  });
  const {
    flushLiveAngleMove,
    flushLiveWheelMove,
    handleAngleSliderChange,
    handleLiveDragToggle,
    handleServoModeChange,
    handleWheelSliderChange,
    scheduleLiveAngleMove,
    scheduleLiveWheelMove,
    updateServoCommand,
    updateServoCommandField,
    updateServoLogicalAngle,
    updateServoWheelMaxSpeed,
    updateServoWheelSlider
  } = useServoCommandRuntime({
    addSystemLog, armConfig, cancelArmLiveMove, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoSafetyMonitor, cancelWheelTurnMonitor,
    liveAngleSendingRef, liveAngleTimerRef, livePositionModeServoRef, liveWheelSendingRef, liveWheelTimerRef, pendingLiveAngleRef, pendingLiveWheelRef,
    prepareServoPositionMode, runServoPositionMotion, sendMoveForServo, servoBusReady, servoSerialQueueBusy, setServoCommandById
  });
  const {
    holdServoAtCurrentPosition,
    pauseServo,
    pauseServoLinkageGroup,
    pauseServoLinkageWheelTargets,
    pauseWheelServo
  } = useServoPauseRuntime({
    addSystemLog, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoLinkageMove, cancelServoLinkageWheelTurnMonitors, cancelServoMotionForLinkage, cancelServoMotionForServo, cancelServoSafetyMonitor,
    cancelWheelTurnMonitor, enqueueServoSerialTask, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, livePositionModeServoRef, rememberServoFeedback,
    sendServoFrameUnlocked, sendServoFrames, servoBusReady, servos, setLinkageWheelDirectionByGroup, updateServoCommandField
  });
  const { addServo, removeServo, updateServoDirection, updateServoLimit } = useServoLibrary({
    cancelLiveAngleMove, cancelLiveWheelMove, cancelServoLinkageMove, cancelServoSafetyMonitor, cancelWheelTurnMonitor, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, livePositionModeServoRef,
    selectedId, servoDraft, servos, setSelectedId, setServoCommandById, setServoDraft, setServoFeedback, setServoLibraryError,
    setServoMotionStatusById, setServos, updateServoCommand
  });
  async function sendGatedMotorCommandBatch(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    if (commands.some(pcCommandIsDangerous) && hardwareGateBlocks("Motor linkage command")) {
      return false;
    }
    return sendAboardMotionBatch(commands, options);
  }
  const {
    addMotorLinkageGroup,
    addMotorToLinkageGroup,
    flushMotorLinkageMove,
    removeMotorFromLinkageGroup,
    removeMotorLinkageGroup,
    scheduleMotorLinkageMove,
    sendMotorLinkageGroup,
    stopMotorLinkageGroup,
    toggleMotorLinkageGroupExpanded,
    updateMotorLinkageGroupEnabled,
    updateMotorLinkageGroupName,
    updateMotorLinkageMaster,
    updateMotorLinkageMemberReverse,
    updateMotorLinkageMemberWeight
  } = useMotorLinkageRuntime({
    addSystemLog, cancelMotorLinkageMove, motorControllerReady, motorLinkageGenerationRef, motorLinkageGroups, motorLinkageGroupsRef, motorLinkageLiveSendingRef,
    motorLinkageLiveTimerRef, motors, nextSeq, pendingMotorLinkageMoveRef, sendAboardMotionBatch: sendGatedMotorCommandBatch, setExpandedMotorLinkageGroupIds, setMotorLinkageGroups, stopMode
  });
  const {
    addServoLinkageGroup,
    addServoToLinkageGroup,
    flushServoLinkageMove,
    removeServoFromLinkageGroup,
    removeServoLinkageGroup,
    scheduleServoLinkageMove,
    syncServoLinkageTargetsToCommands,
    syncServoLinkageWheelTargetsToCommands,
    toggleServoLinkageGroupExpanded,
    updateServoLinkageGroupEnabled,
    updateServoLinkageGroupMode,
    updateServoLinkageGroupName,
    updateServoLinkageMaster,
    updateServoLinkageMemberNumber,
    updateServoLinkageMemberReverse,
    updateServoLinkageMemberWeight,
    updateServoLinkageWheelTurnLimit,
    updateServoLinkageWheelTurnTarget
  } = useServoLinkageRuntime({
    armConfig, cancelArmLiveMove, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoLinkageMove, cancelServoLinkageWheelTurnMonitors, cancelServoSafetyMonitor, cancelWheelTurnMonitor,
    linkageLiveSendingRef, linkageLiveTimerRef, pauseServoLinkageGroup, pendingLinkageMoveRef, sendServoLinkageGroup, servoLinkageGroups, servoLinkageGroupsRef,
    servoSerialQueueBusy, servos, setExpandedServoLinkageGroupIds, setLinkageWheelDirectionByGroup, setServoCommandById, setServoLinkageGroups
  });
  const servoMotionRuntime = useServoMotionRuntime({
    addLog, addSystemLog, beginServoSafetyMonitor, bumpServoMotionGeneration, cancelLiveAngleMove, cancelServoLinkageMove, cancelServoLinkageWheelTurnMonitors, cancelServoMotionForLinkage,
    cancelServoMotionForServo, cancelServoSafetyMonitor, cancelWheelTurnMonitor, enqueueServoSerialTask, getPositionMotionStartAngle, getWheelMotionStartSpeed, isServoMotionCurrent, motionKeyForLinkage,
    motionKeyForServo, pauseServo, pauseServoLinkageGroup, servoBusConnected, servoSmoothPreset, servoSmoothingEnabled, servos, setServoMotionStatus,
    sleepMs, syncServoLinkageTargetsToCommands, syncServoLinkageWheelTargetsToCommands, writeServoGroupPositionUnlocked, writeServoPositionUnlocked, writeServoWheelSpeedUnlocked
  });
  const servoActionsRuntime = useServoActionsRuntime({
    addLog, addSystemLog, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoMotionForServo, cancelServoSafetyMonitor, cancelWheelTurnMonitor,
    dispatchPlatformCommand, lastServoWheelSpeedRef, livePositionModeServoRef, pauseServoLinkageGroup, pauseServoLinkageWheelTargets, pauseWheelServo, runServoLinkagePositionMotion,
    runServoLinkageWheelMotion, runServoPositionMotion, runServoWheelMotion, servos, setLinkageWheelDirectionByGroup, startWheelTurnMonitor, updateServoCommandField, sendServoFrames, servoBusReady
  });
  const {
    flushSingleMotorMove,
    readMotor,
    scheduleSingleMotorMove,
    sendMotorSet,
    stopAllMotors: stopAllMotorsRuntime,
    stopMotor,
    updateSingleMotorSpeed
  } = useSingleMotorRuntime({
    addSystemLog, cancelMotorLinkageMove, cancelMotorLinkageMovesForChannels, cancelSingleMotorMove, dispatchPlatformCommand, lastDriveCommandRef,
    motorControllerReady, motorSpeed, nextSeq, pendingSingleMotorMoveRef, selectedMotor, sendAboardCommand, sendAboardMotionBatch, setMotorSpeed,
    singleMotorGenerationRef, singleMotorLiveSendingRef, singleMotorLiveTimerRef, stopMode
  });
  const {
    changeLanguage,
    ensureDebugMode,
    selectModule,
    selectSection,
    selectTestPanel,
    setDebugMode,
    toggleDebugMode
  } = useAppNavigation({
    activeModule, activeTest, addSystemLog, connected, connectionMode, debugEnabled,
    disconnectSerial, i18n, sendDebugSet: sendControllerDebugSet, serialRef, setActiveModule, setActiveSection, setActiveTest,
    setDebugEnabled
  });
  const {
    architecturePluginInstances,
    prepareArchitectureCommand,
    syncArchitecturePluginInstances
  } = useArchitectureRuntime({
    activeModule,
    autoSyncPluginInstances: databaseStatus !== "offline",
    connected,
    connectionMode,
    projectId: currentProject?.id ?? null,
    selectModule,
    setMotors,
    setServos
  });
  function syncArchitectureSnapshot(nextPluginInstances: PluginInstance[], nextComponents?: ComponentDefinition[]) {
    setRuntimeArchitecturePluginInstances(nextPluginInstances);
    if (nextComponents) {
      setRuntimeArchitectureComponents(nextComponents);
    }
    syncArchitecturePluginInstances(nextPluginInstances);
  }
  const currentServoSmoothConfig = resolveServoMotionConfig(servoSmoothPreset);
  const currentServoSafetyConfig = resolveServoSafetyConfig(servoSafetyPreset);
  const activeModuleLabel =
    activeSection === "tests" && activeTest === "pi"
      ? t("testTabs.pi")
      : activeModule === "servo"
      ? t("module.servo")
      : activeModule === "arm"
        ? t("module.arm")
        : activeModule === "motor"
          ? t("module.motor")
          : activeModule === "mapping"
            ? t("module.mapping")
            : t("module.camera");
  const activeSectionLabel =
    activeSection === "console"
      ? t("sections.console")
      : activeSection === "components"
        ? t("sections.components")
        : activeSection === "tests"
          ? t("sections.tests")
          : t("sections.settings");
  const activeModuleMeta =
    activeSection === "tests" && activeTest === "pi"
      ? t("meta.piRemote")
      : activeModule === "servo"
      ? t("meta.servoCount", { count: servos.length })
      : activeModule === "arm"
        ? t("meta.armJoints", { count: armConfig.joints.length })
        : activeModule === "motor"
          ? t("meta.motorCount", { count: motors.length })
          : activeModule === "mapping"
            ? t("meta.inputMappings")
             : t("meta.cameraServos", { pan: cameraConfig.panServoId, tilt: cameraConfig.tiltServoId });
  const debugLabel = activeModule === "servo" || activeModule === "arm" ? "DIRECT" : debugEnabled ? t("status.debug") : t("status.standby");
  const lastMotorErrorLabel = lastMotorError
    ? `${lastMotorError.command ?? "motor"} · ${lastMotorError.code ?? lastMotorError.message}`
    : t("status.noError");
  const databaseStatusValue =
    databaseStatus === "loading"
      ? t("database.loading")
      : databaseStatus === "saving"
        ? t("database.saving")
        : databaseStatus === "offline"
          ? t("database.offline")
          : databaseStatus === "error"
            ? t("database.error")
            : t("database.saved");
  const projectStatusValue = currentProject?.name ?? t("database.noProject");
  const databaseDetailValue =
    databaseStatus === "offline" || databaseStatus === "error"
      ? databaseErrorMessage || t("database.localFallback")
      : lastDatabaseSavedAt
        ? new Date(lastDatabaseSavedAt).toLocaleTimeString()
        : t("database.awaitingSave");
  const {
    applyAppStateSnapshot,
    buildCurrentAppStateSnapshot,
    changeCurrentProject,
    createNewProject,
    mergeDataServiceRuntime
  } = useAppPersistenceActions({
    activeDriveBase, activeModule, armConfig, armTeachTracks, cameraConfig, currentLanguage, currentProject, currentProjectIdRef,
    currentSessionIdRef, databaseLoadedRef, databaseStatus, driveSpeedLimit, expandedMotorLinkageGroupIds, expandedServoLinkageGroupIds, firmwareBoard, flushEventQueue,
    flushTelemetryQueue, i18n, inputMapping, lastMotorError, linkageWheelDirectionByGroup, logs, motorDraft, motorFeedback,
    motorLinkageGroups, motorSpeed, motors, newProjectName, persistLogEntry, restoreLogEntries, selectedChannel, selectedFirmwarePort,
    selectedGamepadIndex, selectedId, servoCommandById, servoDraft, servoFeedback, servoLinkageGroups, servoSafetyEnabled, servoSafetyPreset,
    servoSmoothPreset, servoSmoothingEnabled, servos, setActiveDriveBase, setActiveModule, setArmConfig, setArmTeachTracks, setCameraConfig,
    setCurrentProject, setDatabaseErrorMessage, setDatabaseStatus, setDriveSpeedLimit, setExpandedMotorLinkageGroupIds, setExpandedServoLinkageGroupIds, setFirmwareBoard, setInputMapping,
    setLastDatabaseSavedAt, setLastMotorError, setLinkageWheelDirectionByGroup, setLogs, setMappingDraft, setMotorDraft, setMotorFeedback, setMotorLinkageGroups,
    setMotorSpeed, setMotors, setNewProjectName, setProjects, setSelectedChannel, setSelectedFirmwarePort, setSelectedGamepadIndex, setSelectedId,
    setServoCommandById, setServoDraft, setServoFeedback, setServoLinkageGroups, setServoSafetyEnabled, setServoSafetyPreset, setServoSmoothPreset, setServoSmoothingEnabled,
    setServos, setStopMode, setWheelTurnProgress, stopMode, t, wheelTurnProgress
  });
  useAppPersistenceEffects({
    applyAppStateSnapshot,
    autoSaveDeps: [
      activeModule,
      activeDriveBase,
      cameraConfig,
      currentLanguage,
      driveSpeedLimit,
      expandedMotorLinkageGroupIds,
      expandedServoLinkageGroupIds,
      firmwareBoard,
      inputMapping,
      linkageWheelDirectionByGroup,
      motorLinkageGroups,
      motorDraft,
      motorSpeed,
      motors,
      armConfig,
      armTeachTracks,
      selectedChannel,
      selectedFirmwarePort,
      selectedGamepadIndex,
      selectedId,
      servoCommandById,
      servoDraft,
      servoLinkageGroups,
      servoSafetyEnabled,
      servoSafetyPreset,
      servoSmoothPreset,
      servoSmoothingEnabled,
      servos,
      stopMode,
      wheelTurnProgress
    ],
    buildCurrentAppStateSnapshot,
    cancelArmLiveMove,
    cancelLiveAngleMove,
    cancelLiveWheelMove,
    cancelMotorLinkageMove,
    cancelServoLinkageMove,
    cancelServoMotion,
    cancelServoSafetyMonitor,
    cancelWheelTurnMonitor,
    clearFlushTimers,
    currentProjectIdRef,
    currentSessionIdRef,
    databaseLoadedRef,
    databaseSaveTimerRef,
    flushEventQueue,
    flushTelemetryQueue,
    mergeDataServiceRuntime,
    setCurrentProject,
    setDatabaseErrorMessage,
    setDatabaseStatus,
    setLastDatabaseSavedAt,
    setProjects,
    t
  });
  useAppRuntimeEffects({
    activeModule, addSystemLog, cameraCanCommand, cameraConfig, cancelServoSafetyMonitor, checkFirmwareHelper, connected, currentLanguage, driveControllerReady: motorControllerReady,
    driveInput, driveSetupMappings, driveTargets, driveTargetsRef, lastDriveCommandRef, motorLinkageGroups, motorLinkageGroupsRef, motors, nextSeq,
    nudgeCamera, sendAboardMotionBatch, selectedChannel, selectedId, servoLinkageGroups, servoLinkageGroupsRef, servoSafetyEnabled, servoSafetyPreset,
    servoSafetySettingsRef, servos, setArmConfig, setCameraStreamFailed, setCameraStreamLoaded, setMotorLinkageGroups, setSelectedChannel, setSelectedId,
    setServoCommandById, setServoLinkageGroups, stopMode
  });
  function rememberServoFeedback(feedback: InboundMessage & { type: "servo.feedback" }) { return feedbackRuntime.rememberServoFeedback(feedback); }
  function rememberMotorFeedback(message: InboundMessage & { type: "motor.feedback" }) { return feedbackRuntime.rememberMotorFeedback(message); }
  function addErrorLog(error: unknown, fallbackKey: string) { return feedbackRuntime.addErrorLog(error, fallbackKey); }
  function nextSeq() { return servoSerialTransport.nextSeq(); }
  function enqueueServoSerialTask<T>(task: () => Promise<T>): Promise<T> {
    return servoSerialTransport.enqueueServoSerialTask(task);
  }
  async function sendServoFrameUnlocked(frame: number[], waitMs = 80, logFrame = true, options?: ServoFrameSendOptions) { return servoSerialTransport.sendServoFrameUnlocked(frame, waitMs, logFrame, options); }
  async function sendServoFrame(frame: number[], waitMs = 80, logFrame = true, options?: ServoFrameSendOptions) { return servoSerialTransport.sendServoFrame(frame, waitMs, logFrame, options); }
  async function sendServoFrames(frames: number[] | number[][], waitMs = 80) { return servoSerialTransport.sendServoFrames(frames, waitMs); }
  async function sendServoCommandUnlocked(command: PcCommand, waitMs = 80, logCommand = true, options?: ServoFrameSendOptions) { return servoSerialTransport.sendServoCommandUnlocked(command, waitMs, logCommand, options); }
  async function sendServoCommand(command: PcCommand, waitMs = 80, logCommand = true, options?: ServoFrameSendOptions) { return servoSerialTransport.sendServoCommand(command, waitMs, logCommand, options); }
  async function sendCameraGimbalCommand(command: unknown) {
    const response = await sendServoCommand(command as PcCommand, 120, true);
    return Boolean(response && response.type !== "error");
  }
  function resetControllerRuntimeState() {
    setLastMotorError(null);
  }
  async function writeControllerDebugSetToClient(_client: WebSerialClient, _module: ActiveModule, _enabled: boolean) {
    return true;
  }
  async function sendControllerDebugSet(module: ActiveModule, enabled: boolean) {
    if (isServoBusModule(module) || !enabled) {
      return true;
    }
    addSystemLog("logs.aBoardBridgeRequired", "warn");
    return false;
  }
  function sleepMs(ms: number) { return servoSerialTransport.sleepMs(ms); }
  function servoBusConnected() { return servoSerialTransport.servoBusConnected(); }
  function servoSerialQueueBusy() {
    const status = servoSerialTransport.getServoSerialQueueStatus();
    return status.inFlight || status.queueDepth > 0;
  }

  function prepareServoPositionMode(servo: ServoProfile, options: { logFrame?: boolean; waitMs?: number } = {}) {
    return enqueueServoSerialTask(() =>
      prepareServoPositionModeUnlocked({
        servo,
        waitMs: options.waitMs ?? 40,
        logFrame: options.logFrame ?? false
      })
    );
  }

  function clearServoRealtimeAvailability() {
    servoRealtimeNoResponseAtRef.current = {};
    setServoMotionStatusById((current) => {
      let changed = false;
      const next = { ...current };
      for (const key of Object.keys(next)) {
        const servoId = Number(key);
        if (next[servoId] === "unreachable") {
          delete next[servoId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  function markServoRealtimeUnavailable(servoId: number) {
    const wasUnavailable = Boolean(servoRealtimeNoResponseAtRef.current[servoId]);
    delete servoRealtimePrimedAtRef.current[servoId];
    servoRealtimeNoResponseAtRef.current[servoId] = Date.now();
    servoRealtimeAutoPrimeKeyRef.current = "";
    if (!wasUnavailable) {
      setServoRealtimeRetryGeneration((generation) => generation + 1);
    }
    setServoMotionStatusById((current) =>
      current[servoId] === "unreachable"
        ? current
        : {
            ...current,
            [servoId]: "unreachable"
          }
    );
  }

  function markServoRealtimeAvailable(servoId: number) {
    delete servoRealtimeNoResponseAtRef.current[servoId];
    setServoMotionStatusById((current) => {
      if (current[servoId] !== "unreachable") {
        return current;
      }
      const next = { ...current };
      delete next[servoId];
      return next;
    });
  }

  function syncServoRealtimeFeedbackToDrafts(servo: ServoProfile, feedback: InboundMessage & { type: "servo.feedback" }, options: { syncArm?: boolean } = {}) {
    if (feedback.positionDeg === undefined) {
      return false;
    }

    setServoCommandById((current) => {
      const state = getServoCommandState(current, servo.id);
      const logicalAngle = servoPhysicalToLogicalAngleWithReverse(servo, feedback.positionDeg!, state.reverse);
      return {
        ...current,
        [servo.id]: {
          ...state,
          angleDeg: formatServoAngle(logicalAngle)
        }
      };
    });

    if (options.syncArm) {
      setArmConfig((current) => ({
        ...current,
        joints: current.joints.map((joint) => {
          if (joint.servoId !== servo.id) {
            return joint;
          }
          const logicalAngle = servoPhysicalToLogicalAngleWithReverse(servo, feedback.positionDeg!, joint.reverse);
          return { ...joint, angleDeg: logicalAngle };
        })
      }));
    }

    return true;
  }

  async function readServoRealtimeForDebug(servo: ServoProfile, options: { quiet?: boolean; syncArm?: boolean } = {}) {
    if (!servoBusConnected()) {
      if (!options.quiet) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return null;
    }
    const result = await dispatchPlatformCommand(createPlatformCommand("servo.read_feedback", `servo:${servo.id}`));
    const feedback = servoRealtimeFeedbackFromResponse(result.response);
    if (!feedback) {
      const packet = result.response as Partial<FeetechStatusPacket> | null | undefined;
      if (!packet || typeof packet.status !== "number") {
        markServoRealtimeUnavailable(servo.id);
      } else {
        delete servoRealtimePrimedAtRef.current[servo.id];
        servoRealtimeAutoPrimeKeyRef.current = "";
      }
      if (!options.quiet) {
        addLog("system", packet && typeof packet.status === "number" ? `ID${servo.id} read status error ${packet.status}` : `ID${servo.id} read no response`, "warn");
      }
      return null;
    }

    markServoRealtimeAvailable(servo.id);
    if (syncServoRealtimeFeedbackToDrafts(servo, feedback, { syncArm: options.syncArm })) {
      servoRealtimePrimedAtRef.current[servo.id] = Date.now();
      if (!options.quiet) {
        addLog("system", `ID${servo.id} synced current position ${feedback.positionDeg?.toFixed(1) ?? "--"} deg`);
      }
    }
    return feedback;
  }

  async function primeServoRealtimeBeforeMotion(servo: ServoProfile, options: { live?: boolean; syncArm?: boolean } = {}) {
    const wasPrimed = Boolean(servoRealtimePrimedAtRef.current[servo.id]);
    if (options.live && wasPrimed) {
      return true;
    }
    const feedback = await readServoRealtimeForDebug(servo, { quiet: options.live === true, syncArm: options.syncArm });
    if (!feedback) {
      return false;
    }
    if (!wasPrimed && !options.live) {
      addLog("system", `ID${servo.id} first target blocked until current position is synced`, "warn");
    }
    return wasPrimed;
  }

  async function primeArmConfigRealtimeBeforeMotion(config: ArmConfig, options: { extraServos?: ServoProfile[]; live?: boolean } = {}) {
    const targets = calculateArmMotionTargets(config, options.extraServos ?? []);
    if (targets.length === 0) {
      return true;
    }
    let allWerePrimed = true;
    for (const target of targets) {
      const wasPrimed = Boolean(servoRealtimePrimedAtRef.current[target.servoId]);
      if (!wasPrimed) {
        allWerePrimed = false;
      }
      if (options.live && wasPrimed) {
        continue;
      }
      const feedback = await readServoRealtimeForDebug(target.servo, { quiet: options.live === true, syncArm: true });
      if (!feedback) {
        return false;
      }
    }
    return allWerePrimed;
  }

  async function runServoPositionMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    logicalAngleDeg: number,
    options: { live?: boolean } = {}
  ) {
    if (hardwareGateBlocks(`Servo ${servo.id} position command`)) {
      return false;
    }
    const primed = await primeServoRealtimeBeforeMotion(servo, { live: options.live, syncArm: true });
    if (!primed) {
      return false;
    }
    return servoMotionRuntime.runServoPositionMotion(servo, state, logicalAngleDeg, options);
  }
  async function runServoWheelMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    effectiveWheelSpeed: number,
    options: { live?: boolean; log?: boolean } = {}
  ) {
    if (hardwareGateBlocks(`Servo ${servo.id} wheel command`)) {
      return false;
    }
    const primed = await primeServoRealtimeBeforeMotion(servo, { live: options.live, syncArm: true });
    if (!primed) {
      return false;
    }
    return servoMotionRuntime.runServoWheelMotion(servo, state, effectiveWheelSpeed, options);
  }
  async function runServoLinkagePositionMotion(group: ServoLinkageGroup, live = false) {
    if (hardwareGateBlocks(`Servo linkage ${group.name} command`)) {
      return false;
    }
    const targets = calculateServoLinkageTargets(group, servos);
    let allWerePrimed = true;
    for (const target of targets) {
      const primed = await primeServoRealtimeBeforeMotion(target.servo, { live, syncArm: true });
      if (!primed) {
        allWerePrimed = false;
      }
    }
    if (!allWerePrimed) {
      return false;
    }
    return servoMotionRuntime.runServoLinkagePositionMotion(group, live);
  }
  async function runServoLinkageWheelMotion(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    if (hardwareGateBlocks(`Servo linkage ${group.name} wheel command`)) {
      return false;
    }
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);
    let allWerePrimed = true;
    for (const target of targets) {
      const primed = await primeServoRealtimeBeforeMotion(target.servo, { syncArm: true });
      if (!primed) {
        allWerePrimed = false;
      }
    }
    if (!allWerePrimed) {
      return false;
    }
    return servoMotionRuntime.runServoLinkageWheelMotion(group, direction);
  }
  function startAboardImuCalibration() {
    const next = beginImuCalibration();
    aBoardImuCalibrationRef.current = next;
    setABoardImuCalibration(next);
    setABoardImuError(null);
  }
  function handleImuFeedback(message: ImuFeedback) {
    const receivedAtMs = Date.now();
    let calibration = aBoardImuCalibrationRef.current;
    if (message.magRaw && calibration.active) {
      calibration = updateImuCalibration(calibration, message.magRaw, receivedAtMs);
      aBoardImuCalibrationRef.current = calibration;
      setABoardImuCalibration(calibration);
    }
    setABoardImuFeedback(message);
    setABoardImuError(message.error ?? null);
    setABoardImuAttitude(calculateImuAttitude(message, calibration, receivedAtMs));
  }
  function handleMessage(message: InboundMessage, options: { log?: boolean } = {}) {
    if (options.log !== false) {
      addLog("rx", JSON.stringify(message), message.type === "error" ? "error" : "info");
    }
    if (message.type === "servo.feedback") {
      rememberServoFeedback(message);
    }
    if (message.type === "motor.feedback") {
      setLastMotorError(null);
      rememberMotorFeedback(message);
    }
    if (message.type === "imu.feedback") {
      handleImuFeedback(message);
    }
  }
  function clearPendingAboardMotionBatch() {
    aBoardMotionGenerationRef.current += 1;
    const pending = pendingAboardMotionBatchRef.current;
    if (!pending) {
      return;
    }
    pendingAboardMotionBatchRef.current = null;
    pending.resolve(false);
  }
  async function runAboardBridgeCommandExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = aBoardCommandQueueRef.current;
    let releaseCurrent: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    aBoardCommandQueueRef.current = previous.then(() => current, () => current);
    await previous.catch(() => undefined);
    aBoardCommandInFlightRef.current = true;
    try {
      return await task();
    } finally {
      aBoardCommandInFlightRef.current = false;
      releaseCurrent();
    }
  }
  function aboardCommandSent(command: PcCommand, result: AboardBridgeCommandResult | null) {
    if (!result || result.busy) {
      return false;
    }
    const commandError = result.messages.find((message): message is InboundMessage & { type: "error" } => message.type === "error");
    if (commandError) {
      return false;
    }
    return result.ok || result.messages.some((message) => message.seq === command.seq);
  }
  async function sendAboardCommand(command: PcCommand, options: { log?: boolean; timeoutMs?: number; exclusive?: boolean } = {}) {
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return null;
    }
    const bridgeCommand = normalizeAboardSemanticCommand(command);
    try {
      if (options.log !== false) {
        addLog("tx", JSON.stringify(bridgeCommand));
      }
      const sendCommand = () => sendAboardBridgeCommand(piRemoteForm.host, bridgeCommand, { timeoutMs: options.timeoutMs });
      const result = options.exclusive === false
        ? await sendCommand()
        : await runAboardBridgeCommandExclusive(sendCommand);
      updateAboardBridgeRuntimeDetail(result);
      for (const message of result.messages) {
        handleMessage(message, { log: options.log });
      }
      return result;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge command failed";
      aBoardBridgeBusyRef.current = false;
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return null;
    }
  }
  function normalizeAboardSemanticCommand(command: PcCommand): PcCommand {
    return command;
  }
  async function sendAboardCommandOutcome(command: PcCommand, options: { log?: boolean; timeoutMs?: number; exclusive?: boolean } = {}): Promise<AboardCommandOutcome> {
    const bridgeCommand = normalizeAboardSemanticCommand(command);
    const result = await sendAboardCommand(bridgeCommand, options);
    return {
      busy: result?.busy === true,
      result,
      sent: aboardCommandSent(bridgeCommand, result)
    };
  }
  async function sendLatestAboardMotionBatch(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return false;
    }
    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }
    if (pendingAboardMotionBatchRef.current) {
      pendingAboardMotionBatchRef.current.resolve(false);
    }
    const result = new Promise<boolean>((resolve) => {
      pendingAboardMotionBatchRef.current = { commands, options, generation: aBoardMotionGenerationRef.current, resolve };
    });
    void drainLatestAboardMotionBatch();
    return result;
  }
  async function drainLatestAboardMotionBatch() {
    if (aBoardMotionBatchSendingRef.current) {
      return;
    }
    aBoardMotionBatchSendingRef.current = true;
    let retryScheduled = false;
    try {
      while (pendingAboardMotionBatchRef.current) {
        const pending = pendingAboardMotionBatchRef.current;
        pendingAboardMotionBatchRef.current = null;
        let sent = true;
        let retryPending = false;
        for (const command of pending.commands) {
          if (aBoardMotionGenerationRef.current !== pending.generation || (pending.options.shouldRun && !pending.options.shouldRun())) {
            sent = false;
            break;
          }
          const outcome = await sendAboardCommandOutcome(command, { log: pending.options.log });
          if (outcome.busy) {
            retryPending = true;
            sent = false;
            break;
          }
          if (!outcome.sent) {
            sent = false;
            break;
          }
        }
        if (retryPending && !pendingAboardMotionBatchRef.current && aBoardMotionGenerationRef.current === pending.generation) {
          pendingAboardMotionBatchRef.current = pending;
          retryScheduled = true;
          window.setTimeout(() => {
            void drainLatestAboardMotionBatch();
          }, A_BOARD_BUSY_RETRY_MS);
          break;
        } else {
          pending.resolve(sent);
        }
      }
    } finally {
      aBoardMotionBatchSendingRef.current = false;
      if (pendingAboardMotionBatchRef.current && !retryScheduled) {
        void drainLatestAboardMotionBatch();
      }
    }
  }
  async function sendAboardMotionCommand(command: PcCommand, options: { log?: boolean; timeoutMs?: number; exclusive?: boolean } = {}) {
    if (pcCommandIsDangerous(command) && hardwareGateBlocks("Motor command")) {
      return false;
    }
    if (shouldClearPendingAboardMotion(command)) {
      clearPendingAboardMotionBatch();
    }
    return (await sendAboardCommandOutcome(command, options)).sent;
  }
  async function sendAboardMotionBatch(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    if (commands.some(pcCommandIsDangerous) && hardwareGateBlocks("Motor command batch")) {
      return false;
    }
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return false;
    }
    const bridgeCommands = commands.map(normalizeAboardSemanticCommand);
    if (isLatestWinsAboardBatch(bridgeCommands)) {
      return sendLatestAboardMotionBatch(bridgeCommands, options);
    }
    clearPendingAboardMotionBatch();
    for (const command of bridgeCommands) {
      if (options.shouldRun && !options.shouldRun()) {
        return false;
      }
      const sent = await sendAboardMotionCommand(command, { log: options.log });
      if (!sent) {
        return false;
      }
    }
    return true;
  }
  function piBridgeConnectionRequest() {
    return {
      host: piRemoteForm.host.trim(),
      port: Number.isFinite(Number(piRemoteForm.port)) ? Number(piRemoteForm.port) : 22,
      username: piRemoteForm.username.trim(),
      password: piRemoteForm.authMode === "password" ? piRemoteForm.password || undefined : undefined,
      privateKeyPath: piRemoteForm.authMode === "privateKey" ? piRemoteForm.privateKeyPath.trim() || undefined : undefined
    };
  }
  function piBridgeSetupProfile() {
    return {
      host: piRemoteForm.host.trim(),
      username: piRemoteForm.username.trim(),
      authMode: piRemoteForm.authMode,
      privateKeyPath: piRemoteForm.privateKeyPath.trim(),
      workspaceDir: piRemoteForm.workspaceDir.trim() || "~/rescue-robot"
    };
  }
  function bridgeHealthDetail(health: AboardBridgeHealth | PiServoBridgeHealth) {
    const busy = "busy" in health && health.busy === true;
    const parts = [busy ? "BUSY" : health.ok ? "OK" : "WAIT", `${health.serialPort} @ ${health.baudRate}`];
    if (health.service) {
      parts.push(health.version ? `${health.service} ${health.version}` : health.service);
    }
    if ("serialProtocolActive" in health && health.serialProtocolActive) {
      parts.push(`protocol ${health.serialProtocolActive}`);
    }
    if (typeof health.queueDepth === "number") {
      parts.push(`queue ${health.queueDepth}`);
    }
    if (health.inFlight) {
      parts.push("in-flight");
    }
    if ("motionPending" in health && health.motionPending) {
      parts.push("motion pending");
    }
    if ("droppedMotionCount" in health && typeof health.droppedMotionCount === "number" && health.droppedMotionCount > 0) {
      parts.push(`dropped ${health.droppedMotionCount}`);
    }
    if ("activeCommand" in health && health.activeCommand) {
      parts.push(`active ${health.activeCommand}`);
    }
    const diagnostic = bridgeDiagnosticSummary(health);
    if (diagnostic) {
      parts.push(diagnostic);
    }
    return parts.join(" / ");
  }
  function bridgeDiagnosticSummary(health: AboardBridgeHealth | PiServoBridgeHealth) {
    const parts: string[] = [];
    if (health.deviceExists === false) {
      parts.push("device missing");
    }
    if (health.lastCloseReason) {
      parts.push(`closed: ${health.lastCloseReason}`);
    }
    const eventKind = health.lastSerialEvent?.kind;
    if (eventKind && eventKind !== "opened") {
      parts.push(`last: ${eventKind}`);
    }
    if (typeof health.consecutiveOpenFailures === "number" && health.consecutiveOpenFailures > 0) {
      parts.push(`open failures ${health.consecutiveOpenFailures}`);
    }
    if (typeof health.reconnectCount === "number" && health.reconnectCount > 0) {
      parts.push(`reconnects ${health.reconnectCount}`);
    }
    const exceptionMessage = health.lastException?.message;
    if (exceptionMessage) {
      parts.push(exceptionMessage.length > 80 ? `${exceptionMessage.slice(0, 77)}...` : exceptionMessage);
    }
    return parts.join(" / ");
  }
  function applyAboardBridgeHealth(health: AboardBridgeHealth) {
    aBoardBridgeBusyRef.current = health.busy === true || health.inFlight === true || (health.queueDepth ?? 0) > 0;
    aBoardBridgeBusyUntilRef.current = aBoardBridgeBusyRef.current ? Date.now() + A_BOARD_BUSY_RETRY_MS : 0;
    if (health.ok && !aBoardBridgeBusyRef.current) {
      aBoardLastOkAtRef.current = Date.now();
    }
    setABoardBridgeDetail(bridgeHealthDetail(health));
  }
  function updateAboardBridgeRuntimeDetail(result: AboardBridgeCommandResult) {
    const busy = result.busy === true || result.inFlight === true || (result.queueDepth ?? 0) > 0;
    aBoardBridgeBusyRef.current = busy;
    aBoardBridgeBusyUntilRef.current = busy ? Date.now() + A_BOARD_BUSY_RETRY_MS : 0;
    if (result.ok && !busy) {
      aBoardLastOkAtRef.current = Date.now();
    }
    const parts = [busy ? "BUSY" : result.ok ? "OK" : "WAIT"];
    if (result.serialPort && typeof result.baudRate === "number") {
      parts.push(`${result.serialPort} @ ${result.baudRate}`);
    } else {
      parts.push("A board bridge");
    }
    if (typeof result.queueDepth === "number") {
      parts.push(`queue ${result.queueDepth}`);
    }
    if (result.serialProtocolActive) {
      parts.push(`protocol ${result.serialProtocolActive}`);
    }
    if (result.inFlight) {
      parts.push("in-flight");
    }
    if (aBoardLastOkAtRef.current && !busy) {
      parts.push(`last OK ${new Date(aBoardLastOkAtRef.current).toLocaleTimeString()}`);
    }
    if (result.error) {
      parts.push(result.error);
    }
    setABoardBridgeDetail(parts.join(" / "));
  }
  function aBoardRuntimeBusy() {
    return (
      aBoardCommandInFlightRef.current ||
      aBoardMotionBatchSendingRef.current ||
      Boolean(pendingAboardMotionBatchRef.current) ||
      (aBoardBridgeBusyRef.current && Date.now() < aBoardBridgeBusyUntilRef.current)
    );
  }
  function bridgeSerialUnavailableMessage(label: string, health: AboardBridgeHealth | PiServoBridgeHealth) {
    const serialState = health.serialOpen === false ? "serial device is not open" : "serial device is unavailable";
    const diagnostic = bridgeDiagnosticSummary(health);
    const diagnosticSuffix = diagnostic ? ` Last serial diagnostic: ${diagnostic}.` : "";
    return `${label} service is online, but ${health.serialPort} ${serialState}.${diagnosticSuffix} Reboot the Raspberry Pi after image initialization, then check UART wiring and overlays.`;
  }
  function beginBridgeManagementAction() {
    if (bridgeManagementBusyRef.current || piRemoteBusy || piCameraBusy) {
      return false;
    }
    bridgeManagementBusyRef.current = true;
    return true;
  }
  function endBridgeManagementAction() {
    bridgeManagementBusyRef.current = false;
  }
  async function checkAboardSerialBridge(options: { automatic?: boolean; quietFailure?: boolean } = {}) {
    if (!options.automatic) {
      aBoardBridgeManualDisconnectRef.current = false;
      aBoardBridgeAutoCheckedHostRef.current = "";
    }
    setABoardBridgeStatus("checking");
    setABoardBridgeError(null);
    try {
      const health = await checkAboardBridge(piRemoteForm.host);
      applyAboardBridgeHealth(health);
      if (!health.ok) {
        const message = bridgeSerialUnavailableMessage("A board bridge", health);
        setABoardBridgeError(message);
        setABoardBridgeStatus("error");
        if (!options.quietFailure) {
          addLog("system", message, "error");
        }
        return false;
      }
      setABoardBridgeStatus("connected");
      addLog("system", `A board bridge ready: ${health.serialPort} @ ${health.baudRate}`);
      return true;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge check failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      if (!options.quietFailure) {
        addLog("system", message, "error");
      }
      return false;
    }
  }
  async function startAboardSerialBridge() {
    if (!beginBridgeManagementAction()) {
      return false;
    }
    aBoardBridgeManualDisconnectRef.current = false;
    aBoardBridgeAutoCheckedHostRef.current = "";
    setABoardBridgeStatus("starting");
    setABoardBridgeError(null);
    try {
      const result = await startAboardBridge(piBridgeConnectionRequest(), piBridgeSetupProfile());
      setABoardBridgeDetail(result.remotePath);
      if (!result.ok) {
        const message = result.exec.stderr || result.exec.stdout || "A board bridge start failed";
        setABoardBridgeError(message);
        setABoardBridgeStatus("error");
        addLog("system", message, "error");
        return false;
      }
      addLog("system", `A board bridge persistent service ready: ${result.serviceName ?? "a-board-serial-bridge.service"} (${result.remotePath})`);
      return await checkAboardSerialBridge();
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge start failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    } finally {
      endBridgeManagementAction();
    }
  }
  function disconnectAboardSerialBridge() {
    aBoardBridgeManualDisconnectRef.current = true;
    clearPendingAboardMotionBatch();
    aBoardBridgeBusyRef.current = false;
    aBoardBridgeBusyUntilRef.current = 0;
    aBoardCommandInFlightRef.current = false;
    aBoardCommandQueueRef.current = Promise.resolve();
    setABoardBridgeStatus("idle");
    setABoardBridgeError(null);
    setABoardBridgeDetail("");
    addLog("system", "A board bridge disconnected");
  }
  function resetPiServoBridgeRuntimeState() {
    cancelArmLiveMove("idle");
    cancelLiveAngleMove();
    cancelLiveWheelMove();
    cancelServoLinkageMove();
    cancelServoMotion();
    cancelServoSafetyMonitor();
    servoSerialQueueRef.current = Promise.resolve();
    armLiveSendingRef.current = false;
    liveAngleSendingRef.current = {};
    liveWheelSendingRef.current = {};
    linkageLiveSendingRef.current = {};
    livePositionModeServoRef.current.clear();
    wheelModeServoRef.current.clear();
    lastServoWheelSpeedRef.current = {};
    servoRealtimePrimedAtRef.current = {};
    clearServoRealtimeAvailability();
    servoRealtimeAutoPrimeKeyRef.current = "";
  }

  function markPiServoBridgeRecovering(message: string) {
    if (piServoBridgeManualDisconnectRef.current) {
      return;
    }
    resetPiServoBridgeRuntimeState();
    piServoBridgeAutoCheckedHostRef.current = "";
    piServoBridgeHostRef.current = "";
    setPiServoBridgeError(message);
    setPiServoBridgeStatus("error");
  }

  function piServoBridgeDebugDisabled(result: { response: InboundMessage | null; messages: InboundMessage[] }) {
    return Boolean(
      (result.response && isServoDebugDisabledError(result.response)) ||
        result.messages.some((message) => isServoDebugDisabledError(message))
    );
  }

  async function enablePiServoBridgeServoDebugMode(host: string, options: { quietSuccess?: boolean } = {}) {
    try {
      const command = buildDebugSetCommand(nextCommandSeq(), "servo", true);
      const result = await sendPiServoBridgeCommandRequest(host, command, {
        timeoutMs: PI_SERVO_BRIDGE_DEBUG_SET_TIMEOUT_MS,
        waitMs: 1000
      });
      if (result.skipped) {
        return "Pi servo bridge skipped the servo debug enable command";
      }
      const acknowledged =
        result.response?.type === "ack" ||
        result.messages.some((message) => message.type === "ack" && message.seq === command.seq);
      if (acknowledged) {
        if (!options.quietSuccess) {
          addLog("system", "Pi servo bridge servo debug mode enabled");
        }
        return null;
      }
      if (result.response?.type === "error") {
        return result.response.message;
      }
      return result.reason || "Pi servo bridge did not acknowledge servo debug mode";
    } catch (error) {
      return isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge debug enable failed";
    }
  }

  async function checkPiServoSerialBridge(options: { automatic?: boolean; preserveStatus?: boolean; quietFailure?: boolean; quietSuccess?: boolean } = {}) {
    if (!options.automatic) {
      piServoBridgeManualDisconnectRef.current = false;
      piServoBridgeAutoCheckedHostRef.current = "";
    }
    const wasDisconnected = piServoBridgeStatus !== "connected";
    if (!options.preserveStatus) {
      setPiServoBridgeStatus("checking");
    }
    setPiServoBridgeError(null);
    try {
      const host = piRemoteForm.host.trim();
      const health = await checkPiServoBridge(host, { timeoutMs: PI_SERVO_BRIDGE_HEALTH_TIMEOUT_MS });
      piServoBridgeHostRef.current = host;
      setPiServoBridgeDetail(bridgeHealthDetail(health));
      if (!health.ok) {
        const message = bridgeSerialUnavailableMessage("Pi servo bridge", health);
        resetPiServoBridgeRuntimeState();
        setPiServoBridgeError(message);
        setPiServoBridgeStatus("error");
        if (!options.quietFailure) {
          addLog("system", message, "error");
        }
        return false;
      }
      if (wasDisconnected) {
        resetPiServoBridgeRuntimeState();
      }
      const debugError = await enablePiServoBridgeServoDebugMode(host, { quietSuccess: options.quietSuccess });
      if (debugError) {
        const message = `Pi servo bridge connected, but servo debug mode was not enabled: ${debugError}`;
        resetPiServoBridgeRuntimeState();
        setPiServoBridgeError(message);
        setPiServoBridgeStatus("error");
        if (!options.quietFailure) {
          addLog("system", message, "error");
        }
        return false;
      }
      setPiServoBridgeStatus("connected");
      if (!options.quietSuccess) {
        addLog("system", `Pi servo bridge ready: ${health.serialPort} @ ${health.baudRate}`);
      }
      return true;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge check failed";
      resetPiServoBridgeRuntimeState();
      setPiServoBridgeError(message);
      setPiServoBridgeStatus("error");
      if (!options.quietFailure) {
        addLog("system", message, "error");
      }
      return false;
    }
  }
  async function startPiServoSerialBridge() {
    if (!beginBridgeManagementAction()) {
      return false;
    }
    piServoBridgeManualDisconnectRef.current = false;
    piServoBridgeAutoCheckedHostRef.current = "";
    setPiServoBridgeStatus("starting");
    setPiServoBridgeError(null);
    try {
      const result = await startPiServoBridge(piBridgeConnectionRequest(), piBridgeSetupProfile());
      setPiServoBridgeDetail(result.remotePath);
      if (!result.ok) {
        const message = result.exec.stderr || result.exec.stdout || "Pi servo bridge start failed";
        setPiServoBridgeError(message);
        setPiServoBridgeStatus("error");
        addLog("system", message, "error");
        return false;
      }
      addLog("system", `Pi servo bridge persistent service ready: ${result.serviceName ?? "pi-servo-serial-bridge.service"} (${result.remotePath})`);
      return await checkPiServoSerialBridge();
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge start failed";
      setPiServoBridgeError(message);
      setPiServoBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    } finally {
      endBridgeManagementAction();
    }
  }
  function disconnectPiServoSerialBridge() {
    piServoBridgeManualDisconnectRef.current = true;
    piServoBridgeHostRef.current = "";
    setPiServoBridgeStatus("idle");
    setPiServoBridgeError(null);
    setPiServoBridgeDetail("");
    addLog("system", "Pi servo bridge disconnected");
  }
  async function sendPiServoBridgeCommandMessage(command: PcCommand, waitMs: number, options: ServoFrameSendOptions = {}) {
    try {
      const host = piServoBridgeHostRef.current || piRemoteForm.host;
      const requestOptions = {
        ...options,
        timeoutMs: Math.max(PI_SERVO_BRIDGE_HEALTH_TIMEOUT_MS, waitMs + PI_SERVO_BRIDGE_FRAME_TIMEOUT_PADDING_MS),
        waitMs
      };
      let result = await sendPiServoBridgeCommandRequest(host, command, requestOptions);
      if (result.skipped) {
        return null;
      }
      if (piServoBridgeDebugDisabled(result)) {
        addLog("system", "Pi servo bridge servo debug mode was off; re-enabling and retrying", "warn");
        const debugError = await enablePiServoBridgeServoDebugMode(host, { quietSuccess: true });
        if (debugError) {
          setPiServoBridgeError(debugError);
          addLog("system", debugError, "error");
        } else {
          result = await sendPiServoBridgeCommandRequest(host, command, requestOptions);
          if (result.skipped) {
            return null;
          }
        }
      }
      for (const message of result.messages) {
        if (message.type === "servo.feedback") {
          rememberServoFeedback(message);
        }
      }
      return result.response;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge command failed";
      setPiServoBridgeError(message);
      addLog("system", message, "error");
      markPiServoBridgeRecovering(message);
      if (!piServoBridgeHealthCheckInFlightRef.current) {
        piServoBridgeHealthCheckInFlightRef.current = true;
        void checkPiServoSerialBridge({ automatic: true, quietFailure: true, quietSuccess: false }).finally(() => {
          piServoBridgeHealthCheckInFlightRef.current = false;
        });
      }
      return null;
    }
  }
  async function sendAboardBridgeCanServoCommand(command: PcCommand, options: { log?: boolean; timeoutMs?: number; exclusive?: boolean } = {}): Promise<AboardBridgeCommandResult | null> {
    if (shouldClearPendingAboardMotion(command)) {
      clearPendingAboardMotionBatch();
    }
    return sendAboardCommand(command, options);
  }
  function nextCommandSeq() {
    return seqRef.current++;
  }
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    if (!shouldAutoCheckAboardBridge({
      activeSection,
      activeTest,
      alreadyCheckedHost: aBoardBridgeAutoCheckedHostRef.current,
      host,
      manualDisconnect: aBoardBridgeManualDisconnectRef.current,
      status: aBoardBridgeStatus
    })) {
      return;
    }
    aBoardBridgeAutoCheckedHostRef.current = host;
    void checkAboardSerialBridge({ automatic: true });
  }, [aBoardBridgeStatus, activeSection, activeTest, piRemoteForm.host]);
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    if (!shouldAutoRecoverBridge({ host, manualDisconnect: aBoardBridgeManualDisconnectRef.current, status: aBoardBridgeStatus })) {
      return;
    }
    const timer = window.setTimeout(() => {
      void checkAboardSerialBridge({ automatic: true, quietFailure: true });
    }, BRIDGE_AUTO_RECOVER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [aBoardBridgeStatus, piRemoteForm.host]);
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    const servoContextActive = shouldAutoCheckPiServoBridgeContext({ activeModule, activeSection, activeTest });
    if (
      !servoContextActive ||
      !host ||
      piServoBridgeManualDisconnectRef.current ||
      piServoBridgeAutoCheckedHostRef.current === host ||
      piServoBridgeStatus === "connected" ||
      piServoBridgeStatus === "checking" ||
      piServoBridgeStatus === "starting"
    ) {
      return;
    }
    piServoBridgeAutoCheckedHostRef.current = host;
    void checkPiServoSerialBridge({ automatic: true });
  }, [activeModule, activeSection, activeTest, piRemoteForm.host, piServoBridgeStatus]);
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    if (!shouldAutoRecoverBridge({ host, manualDisconnect: piServoBridgeManualDisconnectRef.current, status: piServoBridgeStatus })) {
      return;
    }
    const timer = window.setTimeout(() => {
      void checkPiServoSerialBridge({ automatic: true, quietFailure: true });
    }, BRIDGE_AUTO_RECOVER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [piRemoteForm.host, piServoBridgeStatus]);
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    const servoContextActive = shouldAutoCheckPiServoBridgeContext({ activeModule, activeSection, activeTest });
    if (!servoContextActive || !host || piServoBridgeManualDisconnectRef.current || piServoBridgeStatus !== "connected") {
      return;
    }
    const timer = window.setInterval(() => {
      if (piServoBridgeHealthCheckInFlightRef.current) {
        return;
      }
      piServoBridgeHealthCheckInFlightRef.current = true;
      void checkPiServoSerialBridge({
        automatic: true,
        preserveStatus: true,
        quietFailure: true,
        quietSuccess: true
      }).finally(() => {
        piServoBridgeHealthCheckInFlightRef.current = false;
      });
    }, BRIDGE_AUTO_RECOVER_DELAY_MS);
    return () => window.clearInterval(timer);
  }, [activeModule, activeSection, activeTest, piRemoteForm.host, piServoBridgeStatus]);
  useEffect(() => {
    const servoContextActive = shouldAutoCheckPiServoBridgeContext({ activeModule, activeSection, activeTest });
    if (!servoBusReady || !servoContextActive) {
      servoRealtimePrimedAtRef.current = {};
      clearServoRealtimeAvailability();
      servoRealtimeAutoPrimeKeyRef.current = "";
      return;
    }

    const armServoIds = new Set(armConfig.joints.filter((joint) => joint.enabled).map((joint) => joint.servoId));
    const targetServos =
      activeModule === "arm" || activeTest === "arm" || activeTest === "arm3d"
        ? servos.filter((servo) => armServoIds.has(servo.id))
        : selectedServo
          ? [selectedServo]
          : [];
    const autoPrimeKey = [
      activeModule,
      activeSection,
      activeTest,
      targetServos.map((servo) => servo.id).join(",")
    ].join(":");
    if (!targetServos.length) {
      return;
    }
    const allTargetServosReady = targetServos.every(
      (servo) => Boolean(servoRealtimePrimedAtRef.current[servo.id]) && !servoRealtimeNoResponseAtRef.current[servo.id]
    );
    if (servoRealtimeAutoPrimeKeyRef.current === autoPrimeKey && allTargetServosReady) {
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    servoRealtimeAutoPrimeKeyRef.current = autoPrimeKey;

    const scheduleRetry = () => {
      if (cancelled) {
        return;
      }
      retryTimer = window.setTimeout(() => {
        void runAutoPrimeAttempt();
      }, SERVO_REALTIME_AUTO_RETRY_MS);
    };

    const runAutoPrimeAttempt = async () => {
      let shouldRetry = false;
      for (const servo of targetServos) {
        if (cancelled || !servoBusConnected()) {
          return;
        }
        if (servoSerialQueueBusy()) {
          shouldRetry = true;
          break;
        }
        const alreadySynced = Boolean(servoRealtimePrimedAtRef.current[servo.id]);
        const wasUnavailable = Boolean(servoRealtimeNoResponseAtRef.current[servo.id]);
        if (alreadySynced && !wasUnavailable) {
          continue;
        }
        if (wasUnavailable && Date.now() - servoRealtimeNoResponseAtRef.current[servo.id] < SERVO_REALTIME_UNAVAILABLE_RETRY_MS) {
          shouldRetry = true;
          continue;
        }
        const feedback = await readServoRealtimeForDebug(servo, { quiet: true, syncArm: true });
        if (!feedback) {
          shouldRetry = true;
        }
      }
      if (shouldRetry) {
        scheduleRetry();
      }
    };

    void runAutoPrimeAttempt();
    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [activeModule, activeSection, activeTest, armConfig.joints, selectedServo, servoBusReady, servoRealtimeRetryGeneration, servos]);
  useAboardImuPollingRuntime({
    aBoardBridgeConnected,
    aBoardRuntimeBusy,
    activeSection,
    host: piRemoteForm.host,
    sendAboardCommand,
    seqRef,
    setABoardImuError
  });
  function cancelLiveAngleMove(id?: number) { return cancellationRuntime.cancelLiveAngleMove(id); }
  function cancelLiveWheelMove(id?: number) { return cancellationRuntime.cancelLiveWheelMove(id); }
  function cancelArmLiveMove(status: ServoMotionDisplayStatus = "idle") { return cancellationRuntime.cancelArmLiveMove(status); }
  function cancelServoLinkageMove(id?: string) { return cancellationRuntime.cancelServoLinkageMove(id); }
  function cancelMotorLinkageMove(id?: string) { return cancellationRuntime.cancelMotorLinkageMove(id); }
  function cancelMotorLinkageMovesForChannels(channels: string[]) { return cancellationRuntime.cancelMotorLinkageMovesForChannels(channels); }
  function cancelSingleMotorMove(channel?: string) { return cancellationRuntime.cancelSingleMotorMove(channel); }
  const {
    addArmJoint,
    applyArmConfig,
    armServoForJoint,
    flushArmLiveMove,
    handleArmPointerDown,
    handleArmPointerEnd,
    handleArmPointerMove,
    moveArmJoint,
    removeArmJoint,
    setArmLiveDragEnabled,
    updateArmJoint,
    updateArmJointNumber,
    updateArmJointServo
  } = useArmRuntime({
    addSystemLog, armConfig, armLiveSendingRef, armLiveTimerRef, armSegmentPoses, cancelArmLiveMove,
    draggingArmJointIdRef, pendingArmConfigRef, prepareServoPositionMode, runArmPositionMotion, servoBusConnected, servoSerialQueueBusy, servos, setArmConfig
  });
  const {
    exportArmTeachTrack,
    getEnabledArmTeachJoints,
    pauseArmTeachPlayback,
    playArmTeachTrack,
    removeSelectedArmTeachTrack,
    saveCurrentArmTeachTrack,
    startArmTeachRecording,
    stopArmTeachRecording
  } = useArmTeachRuntime({
    addSystemLog, armConfig, armServoForJoint, armTeachDraftName, armTeachDraftNotes, armTeachPlaybackGenerationRef, armTeachRuntimeRef, armTeachStatus,
    armTeachTimerRef, armTeachUnsavedTrack, cancelArmLiveMove, cancelServoMotionForArm, cancelServoSafetyMonitor, currentProjectIdRef, enqueueServoSerialTask, holdServoAtCurrentPosition,
    livePositionModeServoRef, pauseArm, rememberServoFeedback, runArmPositionMotion, selectedArmTeachTrack, sendServoFrame, sendServoFrameUnlocked, servoBusConnected,
    servos, setArmConfig, setArmTeachDraftName, setArmTeachDraftNotes, setArmTeachElapsedMs, setArmTeachLastSampleStatus, setArmTeachSampleCount, setArmTeachStatus,
    setArmTeachTracks, setArmTeachUnsavedTrack, setDatabaseErrorMessage, setDatabaseStatus, setSelectedArmTeachTrackId, sleepMs, t
  });
  async function runArmPositionMotion(config: ArmConfig, live = false, extraServos: ServoProfile[] = []) {
    if (hardwareGateBlocks("Robot arm pose command")) {
      return false;
    }
    const primed = await primeArmConfigRealtimeBeforeMotion(config, { extraServos, live });
    if (!primed) {
      return false;
    }
    return runArmPositionMotionUnsafe(config, live, extraServos);
  }
  async function primeArmForMotion() {
    return primeArmConfigRealtimeBeforeMotion(armConfig, { live: true });
  }
  async function sendArmPose() {
    await runArmPositionMotion(armConfig);
  }
  async function sendArmPoseForConfig(config: ArmConfig, live = false, extraServos: ServoProfile[] = []) {
    return runArmPositionMotion(config, live, extraServos);
  }
  async function pauseArmForConfig(config: ArmConfig, extraServos: ServoProfile[] = []) {
    const targets = calculateArmMotionTargets(config, extraServos);
    if (targets.length === 0) {
      addSystemLog("logs.armNoTargets", "warn");
      return false;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }
    for (const target of targets) {
      cancelServoSafetyMonitor(target.servoId);
      await holdServoAtCurrentPosition(target.servo, target.speedRaw, target.acc);
    }
    addSystemLog("logs.armPaused");
    return true;
  }
  async function pauseArm() {
    cancelArmLiveMove("paused");
    await pauseArmForConfig(armConfig);
  }
  async function connectSerial() { return serialConnectionRuntime.connectSerial(); }
  async function disconnectSerial() { return serialConnectionRuntime.disconnectSerial(); }
  async function sendMoveForServo(servo: ServoProfile, state: ServoCommandState, options: { live?: boolean } = {}) { return servoActionsRuntime.sendMoveForServo(servo, state, options); }
  async function sendServoLinkageGroup(group: ServoLinkageGroup, live = false) { return servoActionsRuntime.sendServoLinkageGroup(group, live); }
  async function sendServoLinkageWheelGroup(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) { return servoActionsRuntime.sendServoLinkageWheelGroup(group, direction); }
  async function stopServo(servo: ServoProfile, state: ServoCommandState) { return servoActionsRuntime.stopServo(servo, state); }
  async function pingServo(servo: ServoProfile) { return servoActionsRuntime.pingServo(servo); }
  async function readServo(servo: ServoProfile) { return readServoRealtimeForDebug(servo, { syncArm: true }); }
  async function runArmTuningProbe() {
    const sequence = createArmTuningProbeSequence(armConfig, { servos, stepDeg: 5 });
    if (sequence.length === 0) {
      addSystemLog("logs.armNoTargets", "warn");
      return false;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }
    if (!servoSafetyEnabled) {
      addSystemLog("logs.armTuningSafetyRequired", "warn");
      return false;
    }

    const probeServos = calculateArmMotionTargets(armConfig).map((target) => target.servo);
    cancelArmLiveMove("idle");
    try {
      for (const probeConfig of sequence) {
        if (!servoBusConnected()) {
          return false;
        }
        const sent = await runArmPositionMotion(probeConfig);
        if (!sent) {
          return false;
        }
        await sleepMs(140);
        for (const servo of probeServos) {
          await readServo(servo);
          await sleepMs(20);
        }
      }
      await runArmPositionMotion(armConfig);
      addSystemLog("logs.armTuningProbeComplete");
      return true;
    } catch {
      addSystemLog("logs.commandInvalid", "error");
      return false;
    }
  }
  async function setTorqueForServo(servo: ServoProfile, enabled: boolean) { return servoActionsRuntime.setTorqueForServo(servo, enabled); }
  async function stopAllMotors(quiet = false) { return stopAllMotorsRuntime(quiet); }
  const dispatchAppPlatformCommand = createAppPlatformCommandDispatcher({
    activeCameraSource,
    armConfig,
    armTeachStatus,
    cameraConfig,
    centerCamera,
    analyzeAiVision: aiVision.analyze,
    captureAiVisionSample: aiVision.captureSample,
    checkAiVisionHelper: aiVision.checkHealth,
    checkFirmwareHelper,
    checkRaspberryPiCamera,
    compileArduinoFirmware,
    components: runtimeArchitectureComponents,
    dispatchPlatformCommand,
    emitPlatformCommandResult,
    execRaspberryPiCommandWith,
    firmwareBoard,
    firmwarePorts,
    installRaspberryPiCameraTools,
    nextSeq,
    pauseArm,
    pauseArmForConfig,
    piRemoteFile,
    piRemoteForm,
    playArmTeachTrack,
    pluginInstances: runtimeArchitecturePluginInstances,
    refreshFirmwarePorts,
    resetCameraSourceRuntime,
    selectedArmTeachTrack,
    selectedFirmwarePort,
    sendArmPoseForConfig,
    sendAboardCommand,
    sendCameraGimbalMove,
    sendAboardMotionBatch,
    servos,
    setSelectedFirmwarePort,
    setupRaspberryPiWorkspace,
    startArmTeachRecording,
    startRaspberryPiCameraStream,
    stopArmTeachRecording,
    stopRaspberryPiCameraStream,
    stopMode,
    t,
    testRaspberryPiConnection,
    uploadAndExecRaspberryPiFileWith,
    uploadCompiledArduinoFirmware,
    uploadRaspberryPiFileWith
  });
  const bootSelfCheckPlatformState = useMemo(
    () => ({
      ...platformState,
      "pi:main": {
        deviceId: "pi:main",
        status: piConnectionReady ? "online" as const : piHelperHealth ? "standby" as const : "offline" as const,
        values: {
          helperReady: Boolean(piHelperHealth),
          connectionReady: piConnectionReady,
          target: `${piRemoteForm.username || "robot1"}@${piRemoteForm.host || "rescue-pi.local"}`,
          lastExitCode: piRemoteExecResult?.exitCode ?? null
        }
      },
      "firmware:local": {
        deviceId: "firmware:local",
        status: firmwareBusy ? "standby" as const : firmwareHelperHealth ? "online" as const : "offline" as const,
        values: {
          helperReady: Boolean(firmwareHelperHealth),
          busy: firmwareBusy,
          status: firmwareStatus,
          port: selectedFirmwarePort || null,
          board: firmwareBoard || null
        }
      }
    }),
    [firmwareBoard, firmwareBusy, firmwareHelperHealth, firmwareStatus, piConnectionReady, piHelperHealth, piRemoteExecResult?.exitCode, piRemoteForm.host, piRemoteForm.username, platformState, selectedFirmwarePort]
  );
  const bootSelfCheck = useBootSelfCheckRuntime({
    activeSection,
    addLog,
    checkAboardSerialBridge,
    checkPiServoSerialBridge,
    dispatchPlatformCommand: dispatchAppPlatformCommand,
    input: {
      activeCameraSource,
      aBoardBridgeStatus,
      cameraVideoSources,
      connected,
      connectionMode,
      databaseStatus,
      gamepads: gamepads.map((gamepad) => ({ id: gamepad.index, name: gamepad.id || `Gamepad ${gamepad.index}` })),
      motors: motors.map((motor) => ({ id: motor.channel, name: motor.name })),
      piHost: piRemoteForm.host,
      piServoBridgeStatus,
      platformState: bootSelfCheckPlatformState,
      pluginInstanceCount: architecturePluginInstances.length,
      projectId: currentProject?.id ?? null,
      projectName: currentProject?.name ?? null,
      servos: servos.map((servo) => ({ id: servo.id, name: servo.name }))
    },
    selectModule,
    selectSection,
    startAboardSerialBridge,
    startPiServoSerialBridge
  });
  useEffect(() => {
    bootSelfCheckGateRef.current = bootSelfCheck.gate;
  }, [bootSelfCheck.gate]);
  const diagnosticAgent = useDiagnosticAgentRuntime({
    context: {
      activeCameraSource,
      activeModule,
      activeSection,
      cameraVideoSources,
      currentProjectName: currentProject?.name ?? null,
      logs,
      motors: motors.map((motor) => ({ id: motor.channel, name: motor.name })),
      platformState: bootSelfCheckPlatformState,
      servos: servos.map((servo) => ({ id: servo.id, name: servo.name }))
    },
    dispatchPlatformCommand: dispatchAppPlatformCommand,
    t
  });
  const renderPlatformPanel = createPlatformPanelRenderer({
    addLog,
    dispatchPlatformCommand: dispatchAppPlatformCommand,
    platformCapabilityCount,
    platformDeviceCount,
    platformDevices,
    platformEventBusRef,
    platformEvents,
    platformStateCount,
    resolvedPlatformDeviceId,
    selectedPlatformControlDraft,
    selectedPlatformDevice,
    selectedPlatformState,
    selectedPlatformUiPanel,
    setSelectedPlatformDeviceId,
    updatePlatformControlDraft
  });
  const renderArmCanvas = createArmCanvasRenderer({
    armConfig,
    armSegmentPoses,
    calculateArmMotionTargets,
    handleArmPointerDown,
    handleArmPointerEnd,
    handleArmPointerMove,
    servoBusConnected,
    t
  });
  return { activeModule, activeModuleLabel, activeSection, changeCurrentProject, changeLanguage, connectSerial, connected, createNewProject, currentLanguage, currentProject, databaseDetailValue, databaseStatus, databaseStatusValue, debugEnabled, debugLabel, disconnectSerial, newProjectName, projectStatusValue, projects, selectSection, setNewProjectName, t, toggleDebugMode, webSerialAvailable, aiVision, bootSelfCheck, diagnosticAgent, activeDriveBase, activeGamepad, activeSectionLabel, renderArmCanvas, cameraPreviewCommand, cameraStreamFailed, cameraStreamLoaded, cameraStreamUrl, completeMotorMappingCount, driveCanCommand, driveInput, drivePreviewCommand, handleVirtualStickDown, handleVirtualStickMove, logs, motors, resetVirtualStick, selectDriveBase, servos, servoFeedback, setCameraStreamFailed, setCameraStreamLoaded, stopAllMotors, virtualDriveInput, activeTest, selectModule, selectTestPanel, piRemote, motorControllerReady, aBoardBridgeBusy, aBoardBridgeConnected, aBoardBridgeDetail, aBoardBridgeError, aBoardBridgeLabel, aBoardBridgeStatus, aBoardBridgeTone, aBoardImuAttitude, aBoardImuCalibration, aBoardImuCalibrationStatus, aBoardImuError, aBoardImuFeedback, checkAboardSerialBridge, disconnectAboardSerialBridge, nextCommandSeq, piServoBridgeBusy, piServoBridgeConnected, piServoBridgeDetail, piServoBridgeError, piServoBridgeLabel, piServoBridgeStatus, piServoBridgeTone, checkPiServoSerialBridge, disconnectPiServoSerialBridge, sendAboardBridgeCanServoCommand, startAboardImuCalibration, startAboardSerialBridge, startPiServoSerialBridge, cameraCanCommand, activeCameraRuntime, activeCameraSource, cameraConfig, cameraConfigError, cameraSourceRuntimeById, cameraStreamReloadToken, cameraValidationError, cameraVideoSources, centerCamera, driveSpeedLimit, driveTargets, nudgeCamera, saveCameraSettings, setDriveSpeedLimit, setStopMode, speedLimitPercent, stopMode, updateCameraActiveSource, updateCameraLatencyProfile, updateCameraNumber, updateCameraSourcePort, updateCameraSourceText, updateCameraStreamMode, updateCameraText, updateCameraVideoLayout, setCameraSourceRuntime, activeModuleMeta, renderPlatformPanel, applyGamepadPresetToDraft, gamepads, mappingDraft, recommendedGamepadPreset, resetMappingSettings, saveMappingSettings, savedGamepadIsCustom, selectedGamepadIndex, selectedGamepadPreset, setSelectedGamepadIndex, setSelectedGamepadPreset, updateGamepadDeadzone, addArmJoint, applyArmConfig, armConfig, armServoForJoint, moveArmJoint, removeArmJoint, setArmConfig, addServo, addServoLinkageGroup, addServoToLinkageGroup, expandedServoLinkageGroupIds, removeServo, removeServoFromLinkageGroup, removeServoLinkageGroup, selectedId, servoDraft, servoLibraryError, servoLinkageGroups, setSelectedId, setServoDraft, toggleServoLinkageGroupExpanded, updateServoDirection, updateServoLimit, updateServoLinkageGroupEnabled, updateServoLinkageGroupMode, updateServoLinkageGroupName, updateServoLinkageMemberNumber, updateServoLinkageMemberReverse, updateServoLinkageMemberWeight, updateServoLinkageWheelTurnLimit, updateServoLinkageWheelTurnTarget, addMotor, addMotorLinkageGroup, addMotorToLinkageGroup, expandedMotorLinkageGroupIds, motorDraft, motorFeedback, motorLibraryError, motorLinkageGroups, motorPinSummary, removeMotor, removeMotorFromLinkageGroup, removeMotorLinkageGroup, selectedChannel, setMotorDraft, setSelectedChannel, toggleMotorLinkageGroupExpanded, updateMotorLinkageGroupEnabled, updateMotorLinkageGroupName, updateMotorLinkageMemberReverse, updateMotorLinkageMemberWeight, armSegmentPoses, calculateArmMotionTargets, pauseArm, primeArmForMotion, selectedArmJoint, sendArmPose, setArmLiveDragEnabled, armTeachDraftName, armTeachDraftNotes, armTeachElapsedMs, armTeachLastSampleStatus, armTeachSampleCount, armTeachStatus, armTeachTracks, armTeachUnsavedTrack, exportArmTeachTrack, getEnabledArmTeachJoints, pauseArmTeachPlayback, playArmTeachTrack, removeSelectedArmTeachTrack, runArmTuningProbe, saveCurrentArmTeachTrack, selectedArmTeachTrack, servoBusConnected, setArmTeachDraftName, setArmTeachDraftNotes, setSelectedArmTeachTrackId, startArmTeachRecording, stopArmTeachRecording, updateArmJoint, updateArmJointNumber, updateArmJointServo, capturingKey, setCapturingKey, updateGamepadAxis, updateGamepadButton, updateKeyboardMapping, cancelServoMotion, currentServoSafetyConfig, currentServoSmoothConfig, enabledServoLinkageGroups, formatLinkageMemberDirection, formatWheelSliderDirectionLabel, handleAngleSliderChange, handleLiveDragToggle, handleServoModeChange, handleWheelSliderChange, linkageWheelDirectionByGroup, pauseServo, pauseServoLinkageGroup, pingServo, readServo, sendMoveForServo, sendServoLinkageGroup, sendServoLinkageWheelGroup, servoCommandById, servoMotionStatusById, servoSafetyEnabled, servoSafetyPreset, servoSafetyStatusById, servoSafetyStatusLabel, servoSafetyStatusTone, servoSmoothPreset, servoSmoothingEnabled, setServoSafetyEnabled, setServoSafetyPreset, setServoSmoothPreset, setServoSmoothingEnabled, setTorqueForServo, updateServoCommandField, updateServoLinkageMaster, updateServoLogicalAngle, updateServoWheelMaxSpeed, updateServoWheelSlider, wheelTurnProgress, canCompileFirmware, canUploadFirmware, checkFirmwareHelper, compileArduinoFirmware, connectionMode, enabledMotorLinkageGroups, firmwareBoard, firmwareBusy, firmwareError, firmwareHelperHealth, firmwareHelperLabel, firmwareHelperTone, firmwareHexLabel, firmwareLogs, firmwarePorts, firmwareStatus, firmwareStatusTone, formatDirectionLabel, lastMotorError, lastMotorErrorLabel, motorConfigError, motorDirection, motorDuty, motorPreviewCommand, motorSpeed, numericMotorSpeed, readMotor, refreshFirmwarePorts, saveMotorMapping, selectedFirmwarePort, selectedMotor, selectedServo, sendMotorConfig, sendMotorLinkageGroup, sendMotorSet, setFirmwareBoard, setFirmwareJob, setFirmwareStatus, setSelectedFirmwarePort, stopMotor, stopMotorLinkageGroup, updateMotorLinkageMaster, updateSelectedMotorMapping, updateSingleMotorSpeed, uploadCompiledArduinoFirmware, selectedArmFeedback, metricNumber, architecturePluginInstances, dispatchPlatformCommand: dispatchAppPlatformCommand, prepareArchitectureCommand, syncArchitecturePluginInstances, syncArchitectureSnapshot };
}

export type AppWorkspaceContext = ReturnType<typeof useAppWorkspaceContext>;
