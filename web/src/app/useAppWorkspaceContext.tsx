import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCameraSettings } from "../features/drive/useCameraSettings";
import { useCameraGimbalRuntime } from "../features/drive/useCameraGimbalRuntime";
import { useCameraSourceRuntime } from "../features/drive/useCameraSourceRuntime";
import { useMotorLibrary } from "../features/motor/useMotorLibrary";
import { useMotorLinkageRuntime } from "../features/motor/useMotorLinkageRuntime";
import { useSingleMotorRuntime } from "../features/motor/useSingleMotorRuntime";
import { useServoActionsRuntime } from "../features/servo/useServoActionsRuntime";
import { useServoLibrary } from "../features/servo/useServoLibrary";
import { useServoLinkageRuntime } from "../features/servo/useServoLinkageRuntime";
import { useServoCommandRuntime } from "../features/servo/useServoCommandRuntime";
import { useServoMotionCore } from "../features/servo/useServoMotionCore";
import { useServoMotionRuntime } from "../features/servo/useServoMotionRuntime";
import { useServoPauseRuntime } from "../features/servo/useServoPauseRuntime";
import { useServoSafetyRuntime } from "../features/servo/useServoSafetyRuntime";
import { useServoWheelTurnRuntime } from "../features/servo/useServoWheelTurnRuntime";
import { useAppLogs } from "./useAppLogs";
import { useArmMotionRuntime } from "../features/arm/useArmMotionRuntime";
import { useArmRuntime } from "../features/arm/useArmRuntime";
import { useArmTeachRuntime } from "../features/arm/useArmTeachRuntime";
import { useFirmwareRuntime } from "./useFirmwareRuntime";
import { useDriveInput } from "./useDriveInput";
import { usePiRemote } from "./usePiRemote";
import { usePlatformCommands } from "./usePlatformCommands";
import { usePlatformRuntime } from "./usePlatformRuntime";
import { useAppPersistenceActions } from "./useAppPersistenceActions";
import { useAppPersistenceEffects } from "./useAppPersistenceEffects";
import { useMotorSerialRuntime } from "./useMotorSerialRuntime";
import { useAppCancellationRuntime } from "./useAppCancellationRuntime";
import { useSerialConnectionRuntime } from "./useSerialConnectionRuntime";
import { useServoSerialTransport } from "./useServoSerialTransport";
import { useAppNavigation } from "./useAppNavigation";
import { useFeedbackRuntime } from "./useFeedbackRuntime";
import { useAppRuntimeEffects } from "./useAppRuntimeEffects";
import { useDisplayFormatters } from "./useDisplayFormatters";
import { useAppStateRefs } from "./useAppStateRefs";
import { createArmCanvasRenderer, createPlatformPanelRenderer } from "./createWorkspaceRenderers";
import { createAppPlatformCommandDispatcher } from "./appPlatformCommandBridge";
import { useArchitectureRuntime } from "./useArchitectureRuntime";
import { DebugModule, InboundMessage, MotorDirection, MOTOR_DIRECTION_DEADTIME_MS, MotorProfile, MotorStopMode, MotorTarget, PcCommand, ServoProfile, DEFAULT_WHEEL_SPEED_LIMIT, applyServoWheelDirection, buildDebugSetCommand, buildMotorConfigCommand, buildMotorSetCommand, buildMotorStopCommand, buildPingFrame, buildReadFeedbackFrame, buildServoMoveCommand, buildWheelModeSetupFrames, buildWriteSpeedFrames, clamp, clampServoLogicalAngle, isMotorDebugDisabledError, isMotorPcCommand, motorDirectionFromSpeed, normalizeMotorChannel, normalizeServoProfile, parseFeetechStatusPacket, parseServoFeedback, requiresMotorDirectionDeadtime, servoLogicalSpan, servoLogicalToPhysicalAngle, servoPhysicalToLogicalAngleWithReverse, toHex, withCommandSeq } from "../lib/protocol";
import { AppConfigSnapshot, AppStateSnapshotV2, createAppConfigSnapshot, createAppStateSnapshotV2, loadOrMigrateAppConfigSnapshot, normalizeAppStateSnapshotV2, saveAppDatabaseSnapshot, PersistedActiveModule, PersistedLogEntry, PersistedServoCommandMap } from "../lib/appDatabase";
import { DataProject, DataTelemetryEntry, CurrentProjectState, appendEvents, appendTelemetry, checkDataService, createProject, endSession, listArmTeachTracks, listProjects, loadCurrentProjectState, saveProjectState, selectProject, startSession } from "../lib/dataService";
import { createArmTuningProbeSequence } from "../lib/armKinematics";
import { ArmTeachTrack, normalizeArmTeachTracks } from "../lib/armTeach";
import { ServoSmoothPreset, resolveServoMotionConfig } from "../lib/servoMotion";
import { ServoSafetyPreset, ServoSafetyTriggerReason, resolveServoSafetyConfig } from "../lib/servoSafety";
import { WHEEL_SLIDER_CENTER_DEG, WHEEL_SLIDER_MAX_DEG, WHEEL_SLIDER_MIN_DEG, clampWheelSliderDeg, commandSpeedRawToWheelSliderDeg, normalizeWheelMaxSpeedRaw, wheelSliderDirection, wheelSliderToCommandSpeedRaw } from "../lib/servoWheelSlider";
import { DEFAULT_DRIVE_CHANNELS, DriveBase, DriveInputState, ZERO_DRIVE_INPUT, combineDriveInputs, mixDriveTargets } from "../lib/drive";
import { ControlAction, DEFAULT_INPUT_MAPPING, GamepadPresetId, InputMapping, cloneMapping, getGamepadPresetMapping, gamepadInputFromGamepad, isCustomGamepadMapping, keyboardInputFromPressedKeys, normalizeInputMapping, resolveGamepadPreset } from "../lib/inputMapping";
import { WebSerialClient } from "../lib/serial";
import { ArmConfig, ArmJointConfig, ArmSegmentPose, CameraConfig, DEFAULT_CAMERA_CONFIG, DEFAULT_LINKAGE_MEMBER_ACC, DEFAULT_LINKAGE_MEMBER_SPEED_RAW, DEFAULT_LINKAGE_WHEEL_TURNS_TARGET, DEFAULT_MOTORS, DEFAULT_SERVOS, MotorLinkageGroup, ServoLinkageGroup, ServoLinkageWheelDirection, ValidationErrorKey, calculateArmSegmentPoses, calculateMotorLinkageTargets, calculateServoLinkageWheelTargets, createDefaultArmConfig, validateCameraConfig, validateMotorMapping } from "../lib/storage";
import { defaultLanguage, isSupportedLanguage } from "../i18n/languages";
import { TB6618_MOTOR_DEBUGGER_INO_FILENAME, buildTb6618MotorDebuggerIno } from "../lib/arduinoFirmware";
import { FirmwareBoardId } from "../lib/firmwareUpload";
import { PiExecResult, PiCameraCheckResult, PiHelperHealth, PiReadinessResult, PiRunPlan, PiSetupProfile, PiUploadResult, checkPiCamera, checkPiReadiness, createPiRunPlan, execPiCommand, installPiCameraTools, isPiRemoteError, requestPiHelperHealth, runUploadedFile, startPiCameraStream, stopPiCameraStream, setupPiWorkspace, testPiConnection, uploadPiFile } from "../lib/piRemote";
import { checkAboardBridge, sendAboardBridgeCommand, startAboardBridge, type AboardBridgeCommandResult } from "../lib/piAboardBridge";
import { checkPiServoBridge, sendPiServoBridgeFrame as sendPiServoBridgeFrameRequest, startPiServoBridge } from "../lib/piServoBridge";
import { shouldAutoCheckAboardBridge } from "./aBoardBridgeAutoCheck";
import {
  beginImuCalibration,
  calculateImuAttitude,
  createDefaultImuCalibration,
  imuCalibrationStatus,
  updateImuCalibration,
  type ImuAttitude,
  type ImuCalibration,
  type ImuFeedback
} from "../lib/imuAttitude";
import { createPlatformCommand } from "../platform/commands";
import { findPlatformUiPanelForDevice, formatPlatformStateValue, limitPlatformEvents, platformControlDefaultsForDevice, PlatformControlDraft, resolveSelectedPlatformDeviceId } from "../platform/ui";
import { ActiveModule, AppSection, ArmMotionTarget, ArmTeachRuntime, ArmTeachStatus, ConnectionMode, DatabaseSaveStatus, FirmwareUploadStatus, GamepadSummary, MotorDebugHandshakeStatus, MotorErrorDisplay, MotorFeedbackMap, PendingCommandResponse, PendingDebugSet, PendingLiveAngleMove, PendingLiveWheelMove, PendingSingleMotorMove, PI_SETUP_PROFILE_STORAGE_KEY, ServoCommandState, ServoCommandStateMap, ServoControlMode, ServoFeedbackMap, ServoMotionDisplayStatus, ServoMotionStatusMap, ServoSafetyDisplayStatus, ServoSafetyMonitor, ServoSafetyStatusMap, TestPanel, WheelTurnProgress, clampServoCommandStateToLimits, createDefaultServoCommandState, databaseStatusTone, debugModuleFor, defaultMotorDraft, defaultPiRemoteForm, defaultServoDraft, formatServoAngle, formatSignedPercent, getServoCommandState, isEditableTarget, isServoBusModule, linkageWheelTurnProgressKey, motorPinSummary, nextMotorDraft, nextMotorLinkageGroupName, nextServoLinkageGroupName, safeCameraGimbalCommandPreview, safeDriveCommandPreview, safeFramePreview, safeMotorCommandPreview, safeSpeedFramePreview, servoMotionStatusLabel, singleWheelTurnProgressKey } from "./appModel";
export function useAppWorkspaceContext() {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : defaultLanguage;
  const { activeSection, setActiveSection, activeTest, setActiveTest, activeModule, setActiveModule, servos, setServos, armConfig, setArmConfig, armTeachTracks, setArmTeachTracks, selectedArmTeachTrackId, setSelectedArmTeachTrackId, armTeachStatus, setArmTeachStatus, armTeachDraftName, setArmTeachDraftName, armTeachDraftNotes, setArmTeachDraftNotes, armTeachElapsedMs, setArmTeachElapsedMs, armTeachSampleCount, setArmTeachSampleCount, armTeachLastSampleStatus, setArmTeachLastSampleStatus, armTeachUnsavedTrack, setArmTeachUnsavedTrack, servoLinkageGroups, setServoLinkageGroups, motors, setMotors, motorLinkageGroups, setMotorLinkageGroups, cameraConfig, setCameraConfig, servoDraft, setServoDraft, motorDraft, setMotorDraft, servoLibraryError, setServoLibraryError, motorLibraryError, setMotorLibraryError, motorConfigError, setMotorConfigError, cameraConfigError, setCameraConfigError, cameraStreamLoaded, setCameraStreamLoaded, cameraStreamFailed, setCameraStreamFailed, debugEnabled, setDebugEnabled, motorDebugHandshakeStatus, setMotorDebugHandshakeStatusState, lastMotorError, setLastMotorError, motorTestBoard, setMotorTestBoard, aBoardBridgeStatus, setABoardBridgeStatus, aBoardBridgeError, setABoardBridgeError, aBoardBridgeDetail, setABoardBridgeDetail, piServoBridgeStatus, setPiServoBridgeStatus, piServoBridgeError, setPiServoBridgeError, piServoBridgeDetail, setPiServoBridgeDetail, connected, setConnected, connectionMode, setConnectionMode, selectedId, setSelectedId, selectedChannel, setSelectedChannel, servoCommandById, setServoCommandById, servoSmoothingEnabled, setServoSmoothingEnabled, servoSmoothPreset, setServoSmoothPreset, servoMotionStatusById, setServoMotionStatusById, servoSafetyEnabled, setServoSafetyEnabled, servoSafetyPreset, setServoSafetyPreset, servoSafetyStatusById, setServoSafetyStatusById, databaseStatus, setDatabaseStatus, currentProject, setCurrentProject, projects, setProjects, newProjectName, setNewProjectName, lastDatabaseSavedAt, setLastDatabaseSavedAt, databaseErrorMessage, setDatabaseErrorMessage, expandedServoLinkageGroupIds, setExpandedServoLinkageGroupIds, expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds, linkageWheelDirectionByGroup, setLinkageWheelDirectionByGroup, motorSpeed, setMotorSpeed, stopMode, setStopMode, servoFeedback, setServoFeedback, wheelTurnProgress, setWheelTurnProgress, motorFeedback, setMotorFeedback, serialRef, seqRef, driveTargetsRef, lastDriveCommandRef, servoSerialQueueRef, liveAngleTimerRef, liveAngleSendingRef, pendingLiveAngleRef, liveWheelTimerRef, liveWheelSendingRef, pendingLiveWheelRef, armLiveTimerRef, armLiveSendingRef, pendingArmConfigRef, draggingArmJointIdRef, armTeachTimerRef, armTeachRuntimeRef, armTeachPlaybackGenerationRef, linkageLiveTimerRef, linkageLiveSendingRef, pendingLinkageMoveRef, servoLinkageGroupsRef, motorLinkageLiveTimerRef, motorLinkageLiveSendingRef, pendingMotorLinkageMoveRef, motorLinkageGroupsRef, motorLinkageGenerationRef, singleMotorLiveTimerRef, singleMotorLiveSendingRef, pendingSingleMotorMoveRef, singleMotorGenerationRef, motorSerialQueueRef, lastMotorSpeedByChannelRef, pendingCommandResponseBySeqRef, servoMotionGenerationRef, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, servoSafetyTimerRef, servoSafetyMonitorRef, servoSafetySettingsRef, livePositionModeServoRef, databaseLoadedRef, databaseSaveTimerRef, currentProjectIdRef, currentSessionIdRef, motorDebugHandshakeStatusRef, motorDebugHandshakePromiseRef, pendingDebugSetBySeqRef } = useAppStateRefs();
  const [aBoardImuFeedback, setABoardImuFeedback] = useState<ImuFeedback | null>(null);
  const [aBoardImuAttitude, setABoardImuAttitude] = useState<ImuAttitude | null>(null);
  const [aBoardImuCalibration, setABoardImuCalibration] = useState<ImuCalibration>(() => createDefaultImuCalibration());
  const [aBoardImuError, setABoardImuError] = useState<string | null>(null);
  const aBoardImuCalibrationRef = useRef(aBoardImuCalibration);
  const aBoardBridgeAutoCheckedHostRef = useRef("");
  const aBoardBridgeManualDisconnectRef = useRef(false);
  const piServoBridgeAutoCheckedHostRef = useRef("");
  const piServoBridgeManualDisconnectRef = useRef(false);
  const aBoardImuPollInFlightRef = useRef(false);
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
    () => calculateArmSegmentPoses(armConfig.joints, { x: 300, y: 250 }),
    [armConfig.joints]
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
  const motorTestBoardIsAboard = motorTestBoard === "robomaster-a";
  const motorControllerReady =
    motorTestBoardIsAboard ? aBoardBridgeConnected : connected && connectionMode !== "servo-bus";
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
  const driveRuntime = useDriveInput({ activeModule, addSystemLog, stopAllMotors });
  const {
    activeDriveBase,
    activeGamepad,
    applyGamepadPresetToDraft,
    capturingKey,
    driveInput,
    driveSpeedLimit,
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
  const driveCanCommand = connected && debugEnabled && activeModule === "camera";
  const webSerialAvailable = typeof navigator !== "undefined" && Boolean(navigator.serial);
  const {
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
    servos
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
    sendPiServoBridgeFrame: sendPiServoBridgeFrameBytes,
    serialRef,
    servoSerialQueueRef
  });
  const {
    enqueueMotorSerialTask,
    handleAckMessage,
    handleErrorMessage,
    handleMotorFirmwareReadyLog,
    resetMotorDebugHandshake,
    resolvePendingCommandResponse,
    send,
    sendDebugSet,
    sendMotorCommand,
    sendMotorCommandBatch,
    sendMotorCommandBatchUnlocked,
    sendMotorCommandFrameUnlocked,
    sendMotorCommandFramesUnlocked,
    setMotorDebugHandshakeStatus,
    writeDebugSetToClient
  } = useMotorSerialRuntime({
    addErrorLog, addLog, addSystemLog, connected, connectionMode, lastMotorSpeedByChannelRef, motorDebugHandshakePromiseRef, motorDebugHandshakeStatusRef,
    motorSerialQueueRef, motors, nextSeq, pendingCommandResponseBySeqRef, pendingDebugSetBySeqRef, platformEventBusRef, serialRef, setDebugEnabled,
    setLastMotorError, setMotorDebugHandshakeStatusState
  });
  const { centerCamera, nudgeCamera, sendCameraGimbalMove } = useCameraGimbalRuntime({
    addSystemLog, cameraConfig, nextSeq, send, setCameraConfig, setCameraConfigError
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
    setServoMotionStatus,
    writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  } = useServoMotionCore({
    addSystemLog, armConfig, enqueueServoSerialTask, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, livePositionModeServoRef, sendServoFrameUnlocked, servoBusConnected,
    servoFeedback, servoLinkageGroupsRef, servoMotionGenerationRef, setServoMotionStatusById
  });
  const cancellationRuntime = useAppCancellationRuntime({
    armLiveTimerRef, cancelServoMotionForArm, cancelServoMotionForLinkage, cancelServoMotionForServo, linkageLiveTimerRef, liveAngleTimerRef, liveWheelTimerRef, motorLinkageGenerationRef,
    motorLinkageGroupsRef, motorLinkageLiveTimerRef, pendingArmConfigRef, pendingLinkageMoveRef, pendingLiveAngleRef, pendingLiveWheelRef, pendingMotorLinkageMoveRef, pendingSingleMotorMoveRef,
    servoLinkageGroupsRef, servos, singleMotorGenerationRef, singleMotorLiveTimerRef
  });
  const serialConnectionRuntime = useSerialConnectionRuntime({
    activeModule, addErrorLog, addLog, addSystemLog, cancelArmLiveMove, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoMotion,
    cancelServoSafetyMonitor, debugEnabled, handleMessage, lastServoWheelSpeedRef, livePositionModeServoRef, platformEventBusRef, resetMotorDebugHandshake, serialRef,
    servoSerialQueueRef, setConnected, setConnectionMode, stopAllMotors, webSerialAvailable, writeDebugSetToClient
  });
  const { dispatchPlatformCommand, emitPlatformCommandResult } = usePlatformCommands({
    enqueueServoSerialTask, nextSeq, platformEventBusRef, rememberServoFeedback, sendAboardBridgeMotorCommand: motorTestBoardIsAboard && aBoardBridgeConnected ? sendAboardBridgeMotorCommand : undefined, sendMotorCommand, sendServoFrameUnlocked, sendServoFrames, servos, writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  });
  const {
    cancelServoLinkageWheelTurnMonitors,
    cancelWheelTurnMonitor,
    startWheelTurnMonitor
  } = useServoWheelTurnRuntime({
    addSystemLog, rememberServoFeedback, sendServoFrame, setWheelTurnProgress
  });
  const { calculateArmMotionTargets, runArmPositionMotion } = useArmMotionRuntime({
    addLog, addSystemLog, beginServoSafetyMonitor, bumpServoMotionGeneration, cancelServoMotionForArm, enqueueServoSerialTask, getPositionMotionStartAngle, isServoMotionCurrent,
    motionKeyForArm, pauseArm, servoBusConnected, servoSmoothPreset, servoSmoothingEnabled, servos, setServoMotionStatus, sleepMs,
    writeServoPositionUnlocked
  });
  const {
    addMotor,
    downloadArduinoFirmware,
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
    runServoPositionMotion, sendMoveForServo, servoBusReady, servoSmoothingEnabled, setServoCommandById
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
    addSystemLog, cancelMotorLinkageMove, connected, connectionMode, motorLinkageGenerationRef, motorLinkageGroups, motorLinkageGroupsRef, motorLinkageLiveSendingRef,
    motorLinkageLiveTimerRef, motors, nextSeq, pendingMotorLinkageMoveRef, sendMotorCommandBatch, setExpandedMotorLinkageGroupIds, setMotorLinkageGroups, stopMode
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
    linkageLiveSendingRef, linkageLiveTimerRef, pauseServoLinkageGroup, pendingLinkageMoveRef, sendServoLinkageGroup, servoLinkageGroups, servoLinkageGroupsRef, servoSmoothingEnabled,
    servos, setExpandedServoLinkageGroupIds, setLinkageWheelDirectionByGroup, setServoCommandById, setServoLinkageGroups
  });
  const servoMotionRuntime = useServoMotionRuntime({
    addLog, addSystemLog, beginServoSafetyMonitor, bumpServoMotionGeneration, cancelLiveAngleMove, cancelServoLinkageMove, cancelServoLinkageWheelTurnMonitors, cancelServoMotionForLinkage,
    cancelServoMotionForServo, cancelServoSafetyMonitor, cancelWheelTurnMonitor, enqueueServoSerialTask, getPositionMotionStartAngle, getWheelMotionStartSpeed, isServoMotionCurrent, motionKeyForLinkage,
    motionKeyForServo, pauseServo, pauseServoLinkageGroup, servoBusConnected, servoSmoothPreset, servoSmoothingEnabled, servos, setServoMotionStatus,
    sleepMs, syncServoLinkageTargetsToCommands, syncServoLinkageWheelTargetsToCommands, writeServoPositionUnlocked, writeServoWheelSpeedUnlocked
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
    motorControllerReady, motorSpeed, nextSeq, pendingSingleMotorMoveRef, selectedMotor, sendMotorCommand: sendSelectedMotorCommand, sendMotorCommandBatch: sendSelectedMotorCommandBatch, setMotorSpeed,
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
    disconnectSerial, i18n, sendDebugSet, serialRef, setActiveModule, setActiveSection, setActiveTest,
    setDebugEnabled
  });
  const {
    architecturePluginInstances,
    prepareArchitectureCommand,
    syncArchitecturePluginInstances
  } = useArchitectureRuntime({
    activeModule,
    connected,
    connectionMode,
    selectModule,
    setMotors,
    setServos
  });
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
  const motorDebugHandshakeLabel =
    motorDebugHandshakeStatus === "ready"
      ? t("status.ready")
      : motorDebugHandshakeStatus === "syncing"
        ? t("status.syncing")
        : motorDebugHandshakeStatus === "error"
          ? t("status.error")
          : t("status.unknown");
  const motorDebugHandshakeTone: "neutral" | "online" | "warning" | "danger" =
    motorDebugHandshakeStatus === "ready"
      ? "online"
      : motorDebugHandshakeStatus === "syncing"
        ? "warning"
        : motorDebugHandshakeStatus === "error"
          ? "danger"
          : "neutral";
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
    activeModule, addSystemLog, cameraCanCommand, cameraConfig, cancelServoSafetyMonitor, checkFirmwareHelper, connected, currentLanguage,
    driveInput, driveTargets, driveTargetsRef, lastDriveCommandRef, motorLinkageGroups, motorLinkageGroupsRef, motors, nextSeq,
    nudgeCamera, sendMotorCommandBatch, selectedChannel, selectedId, servoLinkageGroups, servoLinkageGroupsRef, servoSafetyEnabled, servoSafetyPreset,
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
  async function sendServoFrameUnlocked(frame: number[], waitMs = 80, logFrame = true) { return servoSerialTransport.sendServoFrameUnlocked(frame, waitMs, logFrame); }
  async function sendServoFrame(frame: number[], waitMs = 80, logFrame = true) { return servoSerialTransport.sendServoFrame(frame, waitMs, logFrame); }
  async function sendServoFrames(frames: number[] | number[][], waitMs = 80) { return servoSerialTransport.sendServoFrames(frames, waitMs); }
  function sleepMs(ms: number) { return servoSerialTransport.sleepMs(ms); }
  function servoBusConnected() { return servoSerialTransport.servoBusConnected(); }
  async function runServoPositionMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    logicalAngleDeg: number,
    options: { live?: boolean } = {}
  ) { return servoMotionRuntime.runServoPositionMotion(servo, state, logicalAngleDeg, options); }
  async function runServoWheelMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    effectiveWheelSpeed: number,
    options: { live?: boolean; log?: boolean } = {}
  ) { return servoMotionRuntime.runServoWheelMotion(servo, state, effectiveWheelSpeed, options); }
  async function runServoLinkagePositionMotion(group: ServoLinkageGroup, live = false) { return servoMotionRuntime.runServoLinkagePositionMotion(group, live); }
  async function runServoLinkageWheelMotion(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) { return servoMotionRuntime.runServoLinkageWheelMotion(group, direction); }
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
    if (message.type === "ack") {
      handleAckMessage(message);
    }
    if (message.type === "error") {
      handleErrorMessage(message);
    }
    if (message.type === "log" && message.message.includes("TB6618 Arduino motor firmware ready")) {
      handleMotorFirmwareReadyLog();
    }
    if (message.type === "servo.feedback") {
      rememberServoFeedback(message);
    }
    if (message.type === "motor.feedback") {
      resolvePendingCommandResponse(message);
      setLastMotorError(null);
      if (message.commandedSpeedPercent !== undefined) {
        lastMotorSpeedByChannelRef.current[normalizeMotorChannel(message.channel)] = message.commandedSpeedPercent;
      }
      rememberMotorFeedback(message);
    }
    if (message.type === "imu.feedback") {
      handleImuFeedback(message);
    }
  }
  async function sendSelectedMotorCommand(command: PcCommand, options: { log?: boolean; retryCount?: number } = {}) {
    if (motorTestBoardIsAboard) {
      return sendAboardBridgeMotorCommand(command, options);
    }
    return sendMotorCommand(command, options);
  }
  async function sendSelectedMotorCommandBatch(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    if (!motorTestBoardIsAboard) {
      return sendMotorCommandBatch(commands, options);
    }
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return false;
    }
    for (const command of commands) {
      if (options.shouldRun && !options.shouldRun()) {
        return false;
      }
      const sent = await sendAboardBridgeMotorCommand(command, { log: options.log });
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
  async function checkAboardSerialBridge(options: { automatic?: boolean } = {}) {
    if (!options.automatic) {
      aBoardBridgeManualDisconnectRef.current = false;
      aBoardBridgeAutoCheckedHostRef.current = "";
    }
    setABoardBridgeStatus("checking");
    setABoardBridgeError(null);
    try {
      const health = await checkAboardBridge(piRemoteForm.host);
      setABoardBridgeDetail(`${health.serialPort} @ ${health.baudRate}`);
      setABoardBridgeStatus("connected");
      addLog("system", `A board bridge ready: ${health.serialPort} @ ${health.baudRate}`);
      return true;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge check failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    }
  }
  async function startAboardSerialBridge() {
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
      return checkAboardSerialBridge();
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge start failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    }
  }
  function disconnectAboardSerialBridge() {
    aBoardBridgeManualDisconnectRef.current = true;
    setABoardBridgeStatus("idle");
    setABoardBridgeError(null);
    setABoardBridgeDetail("");
    addLog("system", "A board bridge disconnected");
  }
  async function checkPiServoSerialBridge(options: { automatic?: boolean } = {}) {
    if (!options.automatic) {
      piServoBridgeManualDisconnectRef.current = false;
      piServoBridgeAutoCheckedHostRef.current = "";
    }
    setPiServoBridgeStatus("checking");
    setPiServoBridgeError(null);
    try {
      const health = await checkPiServoBridge(piRemoteForm.host);
      setPiServoBridgeDetail(`${health.serialPort} @ ${health.baudRate}`);
      setPiServoBridgeStatus("connected");
      addLog("system", `Pi servo bridge ready: ${health.serialPort} @ ${health.baudRate}`);
      return true;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge check failed";
      setPiServoBridgeError(message);
      setPiServoBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    }
  }
  async function startPiServoSerialBridge() {
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
      return checkPiServoSerialBridge();
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge start failed";
      setPiServoBridgeError(message);
      setPiServoBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    }
  }
  function disconnectPiServoSerialBridge() {
    piServoBridgeManualDisconnectRef.current = true;
    setPiServoBridgeStatus("idle");
    setPiServoBridgeError(null);
    setPiServoBridgeDetail("");
    addLog("system", "Pi servo bridge disconnected");
  }
  async function sendPiServoBridgeFrameBytes(frame: number[], waitMs: number) {
    try {
      const result = await sendPiServoBridgeFrameRequest(piRemoteForm.host, frame, { waitMs });
      return result.rxBytes;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "Pi servo bridge frame failed";
      setPiServoBridgeError(message);
      setPiServoBridgeStatus("error");
      addLog("system", message, "error");
      return [];
    }
  }
  async function sendAboardBridgeMotorCommand(command: PcCommand, options: { log?: boolean } = {}) {
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return false;
    }
    try {
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
      const result = await sendAboardBridgeCommand(piRemoteForm.host, command);
      for (const message of result.messages) {
        handleMessage(message);
      }
      const commandError = result.messages.find((message): message is InboundMessage & { type: "error" } => message.type === "error");
      if (commandError) {
        return false;
      }
      return result.ok || result.messages.some((message) => message.seq === command.seq);
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge command failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return false;
    }
  }
  async function sendAboardBridgeCanServoCommand(command: PcCommand, options: { log?: boolean } = {}): Promise<AboardBridgeCommandResult | null> {
    if (!aBoardBridgeConnected) {
      addLog("system", "A board bridge is not connected", "warn");
      return null;
    }
    try {
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
      const result = await sendAboardBridgeCommand(piRemoteForm.host, command);
      for (const message of result.messages) {
        handleMessage(message);
      }
      return result;
    } catch (error) {
      const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board bridge command failed";
      setABoardBridgeError(message);
      setABoardBridgeStatus("error");
      addLog("system", message, "error");
      return null;
    }
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
      motorTestBoard,
      status: aBoardBridgeStatus
    })) {
      return;
    }
    aBoardBridgeAutoCheckedHostRef.current = host;
    void checkAboardSerialBridge({ automatic: true });
  }, [aBoardBridgeStatus, activeSection, activeTest, motorTestBoard, piRemoteForm.host]);
  useEffect(() => {
    const host = piRemoteForm.host.trim();
    const servoContextActive = activeModule === "servo" || activeModule === "arm" || (activeSection === "tests" && (activeTest === "servo" || activeTest === "arm"));
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
    if (activeSection !== "console" || !aBoardBridgeConnected) {
      aBoardImuPollInFlightRef.current = false;
      return;
    }

    let cancelled = false;
    async function pollAboardImu() {
      if (cancelled || aBoardImuPollInFlightRef.current) {
        return;
      }
      aBoardImuPollInFlightRef.current = true;
      const command: PcCommand = { type: "imu.read", seq: seqRef.current++ };
      try {
        const result = await sendAboardBridgeCommand(piRemoteForm.host, command);
        if (cancelled) {
          return;
        }
        for (const message of result.messages) {
          if (message.type === "imu.feedback") {
            handleMessage(message, { log: false });
          } else if (message.type === "error") {
            setABoardImuError(message.message);
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board IMU read failed";
          setABoardImuError(message);
        }
      } finally {
        aBoardImuPollInFlightRef.current = false;
      }
    }

    void pollAboardImu();
    const timer = window.setInterval(() => {
      void pollAboardImu();
    }, 250);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aBoardBridgeConnected, activeSection, piRemoteForm.host]);
  function cancelLiveAngleMove(id?: number) { return cancellationRuntime.cancelLiveAngleMove(id); }
  function cancelLiveWheelMove(id?: number) { return cancellationRuntime.cancelLiveWheelMove(id); }
  function cancelArmLiveMove(status: ServoMotionDisplayStatus = "idle") { return cancellationRuntime.cancelArmLiveMove(status); }
  function cancelServoLinkageMove(id?: string) { return cancellationRuntime.cancelServoLinkageMove(id); }
  function cancelMotorLinkageMove(id?: string) { return cancellationRuntime.cancelMotorLinkageMove(id); }
  function cancelMotorLinkageMovesForChannels(channels: string[]) { return cancellationRuntime.cancelMotorLinkageMovesForChannels(channels); }
  function cancelSingleMotorMove(channel?: string) { return cancellationRuntime.cancelSingleMotorMove(channel); }
  const {
    addArmJoint,
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
    draggingArmJointIdRef, pendingArmConfigRef, runArmPositionMotion, servoBusReady, servoSmoothingEnabled, servos, setArmConfig
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
  async function readServo(servo: ServoProfile) { return servoActionsRuntime.readServo(servo); }
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
    checkFirmwareHelper,
    checkRaspberryPiCamera,
    compileArduinoFirmware,
    dispatchPlatformCommand,
    emitPlatformCommandResult,
    execRaspberryPiCommandWith,
    firmwareBoard,
    firmwarePorts,
    installRaspberryPiCameraTools,
    pauseArm,
    pauseArmForConfig,
    piRemoteFile,
    piRemoteForm,
    playArmTeachTrack,
    refreshFirmwarePorts,
    resetCameraSourceRuntime,
    selectedArmTeachTrack,
    selectedFirmwarePort,
    sendArmPoseForConfig,
    sendCameraGimbalMove,
    servos,
    setSelectedFirmwarePort,
    setupRaspberryPiWorkspace,
    startArmTeachRecording,
    startRaspberryPiCameraStream,
    stopArmTeachRecording,
    stopRaspberryPiCameraStream,
    t,
    testRaspberryPiConnection,
    uploadAndExecRaspberryPiFileWith,
    uploadCompiledArduinoFirmware,
    uploadRaspberryPiFileWith
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
  return { activeModule, activeModuleLabel, activeSection, changeCurrentProject, changeLanguage, connectSerial, connected, createNewProject, currentLanguage, currentProject, databaseDetailValue, databaseStatus, databaseStatusValue, debugEnabled, debugLabel, disconnectSerial, newProjectName, projectStatusValue, projects, selectSection, setNewProjectName, t, toggleDebugMode, webSerialAvailable, activeDriveBase, activeGamepad, activeSectionLabel, renderArmCanvas, cameraPreviewCommand, cameraStreamFailed, cameraStreamLoaded, cameraStreamUrl, completeMotorMappingCount, driveCanCommand, driveInput, drivePreviewCommand, handleVirtualStickDown, handleVirtualStickMove, logs, motors, resetVirtualStick, selectDriveBase, servos, servoFeedback, setCameraStreamFailed, setCameraStreamLoaded, stopAllMotors, virtualDriveInput, activeTest, selectModule, selectTestPanel, piRemote, motorControllerReady, motorTestBoard, setMotorTestBoard, aBoardBridgeBusy, aBoardBridgeConnected, aBoardBridgeDetail, aBoardBridgeError, aBoardBridgeLabel, aBoardBridgeStatus, aBoardBridgeTone, aBoardImuAttitude, aBoardImuCalibration, aBoardImuCalibrationStatus, aBoardImuError, aBoardImuFeedback, checkAboardSerialBridge, disconnectAboardSerialBridge, nextCommandSeq, piServoBridgeBusy, piServoBridgeConnected, piServoBridgeDetail, piServoBridgeError, piServoBridgeLabel, piServoBridgeStatus, piServoBridgeTone, checkPiServoSerialBridge, disconnectPiServoSerialBridge, sendAboardBridgeCanServoCommand, startAboardImuCalibration, startAboardSerialBridge, startPiServoSerialBridge, cameraCanCommand, activeCameraRuntime, activeCameraSource, cameraConfig, cameraConfigError, cameraSourceRuntimeById, cameraStreamReloadToken, cameraValidationError, cameraVideoSources, centerCamera, driveSpeedLimit, driveTargets, nudgeCamera, saveCameraSettings, setDriveSpeedLimit, setStopMode, speedLimitPercent, stopMode, updateCameraActiveSource, updateCameraLatencyProfile, updateCameraNumber, updateCameraSourcePort, updateCameraSourceText, updateCameraStreamMode, updateCameraText, updateCameraVideoLayout, setCameraSourceRuntime, activeModuleMeta, renderPlatformPanel, applyGamepadPresetToDraft, gamepads, mappingDraft, recommendedGamepadPreset, resetMappingSettings, saveMappingSettings, savedGamepadIsCustom, selectedGamepadIndex, selectedGamepadPreset, setSelectedGamepadIndex, setSelectedGamepadPreset, updateGamepadDeadzone, addArmJoint, armConfig, armServoForJoint, moveArmJoint, removeArmJoint, setArmConfig, addServo, addServoLinkageGroup, addServoToLinkageGroup, expandedServoLinkageGroupIds, removeServo, removeServoFromLinkageGroup, removeServoLinkageGroup, selectedId, servoDraft, servoLibraryError, servoLinkageGroups, setSelectedId, setServoDraft, toggleServoLinkageGroupExpanded, updateServoDirection, updateServoLimit, updateServoLinkageGroupEnabled, updateServoLinkageGroupMode, updateServoLinkageGroupName, updateServoLinkageMemberNumber, updateServoLinkageMemberReverse, updateServoLinkageMemberWeight, updateServoLinkageWheelTurnLimit, updateServoLinkageWheelTurnTarget, addMotor, addMotorLinkageGroup, addMotorToLinkageGroup, expandedMotorLinkageGroupIds, motorDraft, motorFeedback, motorLibraryError, motorLinkageGroups, motorPinSummary, removeMotor, removeMotorFromLinkageGroup, removeMotorLinkageGroup, selectedChannel, setMotorDraft, setSelectedChannel, toggleMotorLinkageGroupExpanded, updateMotorLinkageGroupEnabled, updateMotorLinkageGroupName, updateMotorLinkageMemberReverse, updateMotorLinkageMemberWeight, armSegmentPoses, calculateArmMotionTargets, pauseArm, selectedArmJoint, sendArmPose, setArmLiveDragEnabled, armTeachDraftName, armTeachDraftNotes, armTeachElapsedMs, armTeachLastSampleStatus, armTeachSampleCount, armTeachStatus, armTeachTracks, armTeachUnsavedTrack, exportArmTeachTrack, getEnabledArmTeachJoints, pauseArmTeachPlayback, playArmTeachTrack, removeSelectedArmTeachTrack, runArmTuningProbe, saveCurrentArmTeachTrack, selectedArmTeachTrack, servoBusConnected, setArmTeachDraftName, setArmTeachDraftNotes, setSelectedArmTeachTrackId, startArmTeachRecording, stopArmTeachRecording, updateArmJoint, updateArmJointNumber, updateArmJointServo, capturingKey, setCapturingKey, updateGamepadAxis, updateGamepadButton, updateKeyboardMapping, cancelServoMotion, currentServoSafetyConfig, currentServoSmoothConfig, enabledServoLinkageGroups, formatLinkageMemberDirection, formatWheelSliderDirectionLabel, handleAngleSliderChange, handleLiveDragToggle, handleServoModeChange, handleWheelSliderChange, linkageWheelDirectionByGroup, pauseServo, pauseServoLinkageGroup, pingServo, readServo, sendMoveForServo, sendServoLinkageGroup, sendServoLinkageWheelGroup, servoCommandById, servoMotionStatusById, servoSafetyEnabled, servoSafetyPreset, servoSafetyStatusById, servoSafetyStatusLabel, servoSafetyStatusTone, servoSmoothPreset, servoSmoothingEnabled, setServoSafetyEnabled, setServoSafetyPreset, setServoSmoothPreset, setServoSmoothingEnabled, setTorqueForServo, updateServoCommandField, updateServoLinkageMaster, updateServoLogicalAngle, updateServoWheelMaxSpeed, updateServoWheelSlider, wheelTurnProgress, canCompileFirmware, canUploadFirmware, checkFirmwareHelper, compileArduinoFirmware, connectionMode, downloadArduinoFirmware, enabledMotorLinkageGroups, firmwareBoard, firmwareBusy, firmwareError, firmwareHelperHealth, firmwareHelperLabel, firmwareHelperTone, firmwareHexLabel, firmwareLogs, firmwarePorts, firmwareStatus, firmwareStatusTone, formatDirectionLabel, lastMotorError, lastMotorErrorLabel, motorConfigError, motorDebugHandshakeLabel, motorDebugHandshakeTone, motorDirection, motorDuty, motorPreviewCommand, motorSpeed, numericMotorSpeed, readMotor, refreshFirmwarePorts, saveMotorMapping, selectedFirmwarePort, selectedMotor, selectedServo, sendMotorConfig, sendMotorLinkageGroup, sendMotorSet, setFirmwareBoard, setFirmwareJob, setFirmwareStatus, setSelectedFirmwarePort, stopMotor, stopMotorLinkageGroup, updateMotorLinkageMaster, updateSelectedMotorMapping, updateSingleMotorSpeed, uploadCompiledArduinoFirmware, selectedArmFeedback, metricNumber, architecturePluginInstances, dispatchPlatformCommand: dispatchAppPlatformCommand, prepareArchitectureCommand, syncArchitecturePluginInstances };
}

export type AppWorkspaceContext = ReturnType<typeof useAppWorkspaceContext>;
