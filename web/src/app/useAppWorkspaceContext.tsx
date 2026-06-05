import { useMemo } from "react";
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
import { createPlatformCommand } from "../platform/commands";
import { findPlatformUiPanelForDevice, formatPlatformStateValue, limitPlatformEvents, platformControlDefaultsForDevice, PlatformControlDraft, resolveSelectedPlatformDeviceId } from "../platform/ui";
import { ActiveModule, AppSection, ArmMotionTarget, ArmTeachRuntime, ArmTeachStatus, ComponentPanel, ConnectionMode, DatabaseSaveStatus, FirmwareUploadStatus, GamepadSummary, MotorDebugHandshakeStatus, MotorErrorDisplay, MotorFeedbackMap, PendingCommandResponse, PendingDebugSet, PendingLiveAngleMove, PendingLiveWheelMove, PendingSingleMotorMove, PI_SETUP_PROFILE_STORAGE_KEY, ServoCommandState, ServoCommandStateMap, ServoControlMode, ServoFeedbackMap, ServoMotionDisplayStatus, ServoMotionStatusMap, ServoSafetyDisplayStatus, ServoSafetyMonitor, ServoSafetyStatusMap, TestPanel, WheelTurnProgress, clampServoCommandStateToLimits, createDefaultServoCommandState, databaseStatusTone, debugModuleFor, defaultMotorDraft, defaultPiRemoteForm, defaultServoDraft, formatServoAngle, formatSignedPercent, getServoCommandState, isEditableTarget, isServoBusModule, linkageWheelTurnProgressKey, motorPinSummary, nextMotorDraft, nextMotorLinkageGroupName, nextServoLinkageGroupName, safeCameraGimbalCommandPreview, safeDriveCommandPreview, safeFramePreview, safeMotorCommandPreview, safeSpeedFramePreview, servoMotionStatusLabel, singleWheelTurnProgressKey } from "./appModel";
export function useAppWorkspaceContext() {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : defaultLanguage;
  const { activeSection, setActiveSection, activeComponent, setActiveComponent, activeTest, setActiveTest, activeModule, setActiveModule, servos, setServos, armConfig, setArmConfig, armTeachTracks, setArmTeachTracks, selectedArmTeachTrackId, setSelectedArmTeachTrackId, armTeachStatus, setArmTeachStatus, armTeachDraftName, setArmTeachDraftName, armTeachDraftNotes, setArmTeachDraftNotes, armTeachElapsedMs, setArmTeachElapsedMs, armTeachSampleCount, setArmTeachSampleCount, armTeachLastSampleStatus, setArmTeachLastSampleStatus, armTeachUnsavedTrack, setArmTeachUnsavedTrack, servoLinkageGroups, setServoLinkageGroups, motors, setMotors, motorLinkageGroups, setMotorLinkageGroups, cameraConfig, setCameraConfig, servoDraft, setServoDraft, motorDraft, setMotorDraft, servoLibraryError, setServoLibraryError, motorLibraryError, setMotorLibraryError, motorConfigError, setMotorConfigError, cameraConfigError, setCameraConfigError, cameraStreamLoaded, setCameraStreamLoaded, cameraStreamFailed, setCameraStreamFailed, debugEnabled, setDebugEnabled, motorDebugHandshakeStatus, setMotorDebugHandshakeStatusState, lastMotorError, setLastMotorError, connected, setConnected, connectionMode, setConnectionMode, selectedId, setSelectedId, selectedChannel, setSelectedChannel, servoCommandById, setServoCommandById, servoSmoothingEnabled, setServoSmoothingEnabled, servoSmoothPreset, setServoSmoothPreset, servoMotionStatusById, setServoMotionStatusById, servoSafetyEnabled, setServoSafetyEnabled, servoSafetyPreset, setServoSafetyPreset, servoSafetyStatusById, setServoSafetyStatusById, databaseStatus, setDatabaseStatus, currentProject, setCurrentProject, projects, setProjects, newProjectName, setNewProjectName, lastDatabaseSavedAt, setLastDatabaseSavedAt, databaseErrorMessage, setDatabaseErrorMessage, expandedServoLinkageGroupIds, setExpandedServoLinkageGroupIds, expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds, linkageWheelDirectionByGroup, setLinkageWheelDirectionByGroup, motorSpeed, setMotorSpeed, stopMode, setStopMode, servoFeedback, setServoFeedback, wheelTurnProgress, setWheelTurnProgress, motorFeedback, setMotorFeedback, serialRef, seqRef, driveTargetsRef, lastDriveCommandRef, servoSerialQueueRef, liveAngleTimerRef, liveAngleSendingRef, pendingLiveAngleRef, liveWheelTimerRef, liveWheelSendingRef, pendingLiveWheelRef, armLiveTimerRef, armLiveSendingRef, pendingArmConfigRef, draggingArmJointIdRef, armTeachTimerRef, armTeachRuntimeRef, armTeachPlaybackGenerationRef, linkageLiveTimerRef, linkageLiveSendingRef, pendingLinkageMoveRef, servoLinkageGroupsRef, motorLinkageLiveTimerRef, motorLinkageLiveSendingRef, pendingMotorLinkageMoveRef, motorLinkageGroupsRef, motorLinkageGenerationRef, singleMotorLiveTimerRef, singleMotorLiveSendingRef, pendingSingleMotorMoveRef, singleMotorGenerationRef, motorSerialQueueRef, lastMotorSpeedByChannelRef, pendingCommandResponseBySeqRef, servoMotionGenerationRef, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, servoSafetyTimerRef, servoSafetyMonitorRef, servoSafetySettingsRef, livePositionModeServoRef, databaseLoadedRef, databaseSaveTimerRef, currentProjectIdRef, currentSessionIdRef, motorDebugHandshakeStatusRef, motorDebugHandshakePromiseRef, pendingDebugSetBySeqRef } = useAppStateRefs();
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
    connected,
    connectionMode,
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
    addErrorLog, addLog, connected, connectionMode, seqRef, serialRef, servoSerialQueueRef
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
    enqueueServoSerialTask, nextSeq, platformEventBusRef, rememberServoFeedback, sendMotorCommand, sendServoFrames, servos, writeServoPositionUnlocked,
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
    addSystemLog, armConfig, cancelArmLiveMove, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoSafetyMonitor, cancelWheelTurnMonitor, connected,
    connectionMode, liveAngleSendingRef, liveAngleTimerRef, livePositionModeServoRef, liveWheelSendingRef, liveWheelTimerRef, pendingLiveAngleRef, pendingLiveWheelRef,
    runServoPositionMotion, sendMoveForServo, servoSmoothingEnabled, setServoCommandById
  });
  const {
    holdServoAtCurrentPosition,
    pauseServo,
    pauseServoLinkageGroup,
    pauseServoLinkageWheelTargets,
    pauseWheelServo
  } = useServoPauseRuntime({
    addSystemLog, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoLinkageMove, cancelServoLinkageWheelTurnMonitors, cancelServoMotionForLinkage, cancelServoMotionForServo, cancelServoSafetyMonitor,
    cancelWheelTurnMonitor, connected, connectionMode, enqueueServoSerialTask, lastServoPhysicalAngleRef, lastServoWheelSpeedRef, livePositionModeServoRef, rememberServoFeedback,
    sendServoFrameUnlocked, sendServoFrames, serialRef, servos, setLinkageWheelDirectionByGroup, updateServoCommandField
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
    addLog, addSystemLog, cancelLiveAngleMove, cancelLiveWheelMove, cancelServoMotionForServo, cancelServoSafetyMonitor, cancelWheelTurnMonitor, connected,
    connectionMode, dispatchPlatformCommand, lastServoWheelSpeedRef, livePositionModeServoRef, pauseServoLinkageGroup, pauseServoLinkageWheelTargets, pauseWheelServo, runServoLinkagePositionMotion,
    runServoLinkageWheelMotion, runServoPositionMotion, runServoWheelMotion, servos, setLinkageWheelDirectionByGroup, startWheelTurnMonitor, updateServoCommandField, sendServoFrames
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
    addSystemLog, cancelMotorLinkageMove, cancelMotorLinkageMovesForChannels, cancelSingleMotorMove, connected, connectionMode, dispatchPlatformCommand, lastDriveCommandRef,
    motorSpeed, nextSeq, pendingSingleMotorMoveRef, selectedMotor, sendMotorCommand, sendMotorCommandBatch, serialRef, setMotorSpeed,
    singleMotorGenerationRef, singleMotorLiveSendingRef, singleMotorLiveTimerRef, stopMode
  });
  const {
    changeLanguage,
    ensureDebugMode,
    selectComponentPanel,
    selectModule,
    selectSection,
    selectTestPanel,
    setDebugMode,
    toggleDebugMode
  } = useAppNavigation({
    activeComponent, activeModule, activeTest, addLog, addSystemLog, connected, connectionMode, debugEnabled,
    disconnectSerial, i18n, sendDebugSet, serialRef, setActiveComponent, setActiveModule, setActiveSection, setActiveTest,
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
  function handleMessage(message: InboundMessage) {
    addLog("rx", JSON.stringify(message), message.type === "error" ? "error" : "info");
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
  }
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
    addSystemLog, armConfig, armLiveSendingRef, armLiveTimerRef, armSegmentPoses, cancelArmLiveMove, connected, connectionMode,
    draggingArmJointIdRef, pendingArmConfigRef, runArmPositionMotion, servoSmoothingEnabled, servos, setArmConfig
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
  return { activeModule, activeModuleLabel, activeSection, changeCurrentProject, changeLanguage, connectSerial, connected, createNewProject, currentLanguage, currentProject, databaseDetailValue, databaseStatus, databaseStatusValue, debugEnabled, debugLabel, disconnectSerial, newProjectName, projectStatusValue, projects, selectSection, setNewProjectName, t, toggleDebugMode, webSerialAvailable, activeDriveBase, activeGamepad, activeSectionLabel, renderArmCanvas, cameraPreviewCommand, cameraStreamFailed, cameraStreamLoaded, cameraStreamUrl, completeMotorMappingCount, driveCanCommand, driveInput, drivePreviewCommand, handleVirtualStickDown, handleVirtualStickMove, logs, motors, resetVirtualStick, selectDriveBase, servos, servoFeedback, setCameraStreamFailed, setCameraStreamLoaded, stopAllMotors, virtualDriveInput, activeComponent, activeTest, selectComponentPanel, selectModule, selectTestPanel, piRemote, cameraCanCommand, activeCameraRuntime, activeCameraSource, cameraConfig, cameraConfigError, cameraSourceRuntimeById, cameraStreamReloadToken, cameraValidationError, cameraVideoSources, centerCamera, driveSpeedLimit, driveTargets, nudgeCamera, saveCameraSettings, setDriveSpeedLimit, setStopMode, speedLimitPercent, stopMode, updateCameraActiveSource, updateCameraLatencyProfile, updateCameraNumber, updateCameraSourcePort, updateCameraSourceText, updateCameraStreamMode, updateCameraText, updateCameraVideoLayout, setCameraSourceRuntime, activeModuleMeta, renderPlatformPanel, applyGamepadPresetToDraft, gamepads, mappingDraft, recommendedGamepadPreset, resetMappingSettings, saveMappingSettings, savedGamepadIsCustom, selectedGamepadIndex, selectedGamepadPreset, setSelectedGamepadIndex, setSelectedGamepadPreset, updateGamepadDeadzone, addArmJoint, armConfig, armServoForJoint, moveArmJoint, removeArmJoint, setArmConfig, addServo, addServoLinkageGroup, addServoToLinkageGroup, expandedServoLinkageGroupIds, removeServo, removeServoFromLinkageGroup, removeServoLinkageGroup, selectedId, servoDraft, servoLibraryError, servoLinkageGroups, setSelectedId, setServoDraft, toggleServoLinkageGroupExpanded, updateServoDirection, updateServoLimit, updateServoLinkageGroupEnabled, updateServoLinkageGroupMode, updateServoLinkageGroupName, updateServoLinkageMemberNumber, updateServoLinkageMemberReverse, updateServoLinkageMemberWeight, updateServoLinkageWheelTurnLimit, updateServoLinkageWheelTurnTarget, addMotor, addMotorLinkageGroup, addMotorToLinkageGroup, expandedMotorLinkageGroupIds, motorDraft, motorFeedback, motorLibraryError, motorLinkageGroups, motorPinSummary, removeMotor, removeMotorFromLinkageGroup, removeMotorLinkageGroup, selectedChannel, setMotorDraft, setSelectedChannel, toggleMotorLinkageGroupExpanded, updateMotorLinkageGroupEnabled, updateMotorLinkageGroupName, updateMotorLinkageMemberReverse, updateMotorLinkageMemberWeight, armSegmentPoses, calculateArmMotionTargets, pauseArm, selectedArmJoint, sendArmPose, setArmLiveDragEnabled, armTeachDraftName, armTeachDraftNotes, armTeachElapsedMs, armTeachLastSampleStatus, armTeachSampleCount, armTeachStatus, armTeachTracks, armTeachUnsavedTrack, exportArmTeachTrack, getEnabledArmTeachJoints, pauseArmTeachPlayback, playArmTeachTrack, removeSelectedArmTeachTrack, runArmTuningProbe, saveCurrentArmTeachTrack, selectedArmTeachTrack, servoBusConnected, setArmTeachDraftName, setArmTeachDraftNotes, setSelectedArmTeachTrackId, startArmTeachRecording, stopArmTeachRecording, updateArmJoint, updateArmJointNumber, updateArmJointServo, capturingKey, setCapturingKey, updateGamepadAxis, updateGamepadButton, updateKeyboardMapping, cancelServoMotion, currentServoSafetyConfig, currentServoSmoothConfig, enabledServoLinkageGroups, formatLinkageMemberDirection, formatWheelSliderDirectionLabel, handleAngleSliderChange, handleLiveDragToggle, handleServoModeChange, handleWheelSliderChange, linkageWheelDirectionByGroup, pauseServo, pauseServoLinkageGroup, pingServo, readServo, sendMoveForServo, sendServoLinkageGroup, sendServoLinkageWheelGroup, servoCommandById, servoMotionStatusById, servoSafetyEnabled, servoSafetyPreset, servoSafetyStatusById, servoSafetyStatusLabel, servoSafetyStatusTone, servoSmoothPreset, servoSmoothingEnabled, setServoSafetyEnabled, setServoSafetyPreset, setServoSmoothPreset, setServoSmoothingEnabled, setTorqueForServo, updateServoCommandField, updateServoLinkageMaster, updateServoLogicalAngle, updateServoWheelMaxSpeed, updateServoWheelSlider, wheelTurnProgress, canCompileFirmware, canUploadFirmware, checkFirmwareHelper, compileArduinoFirmware, connectionMode, downloadArduinoFirmware, enabledMotorLinkageGroups, firmwareBoard, firmwareBusy, firmwareError, firmwareHelperHealth, firmwareHelperLabel, firmwareHelperTone, firmwareHexLabel, firmwareLogs, firmwarePorts, firmwareStatus, firmwareStatusTone, formatDirectionLabel, lastMotorError, lastMotorErrorLabel, motorConfigError, motorDebugHandshakeLabel, motorDebugHandshakeTone, motorDirection, motorDuty, motorPreviewCommand, motorSpeed, numericMotorSpeed, readMotor, refreshFirmwarePorts, saveMotorMapping, selectedFirmwarePort, selectedMotor, selectedServo, sendMotorConfig, sendMotorLinkageGroup, sendMotorSet, setFirmwareBoard, setFirmwareJob, setFirmwareStatus, setSelectedFirmwarePort, stopMotor, stopMotorLinkageGroup, updateMotorLinkageMaster, updateSelectedMotorMapping, updateSingleMotorSpeed, uploadCompiledArduinoFirmware, selectedArmFeedback, metricNumber, architecturePluginInstances, dispatchPlatformCommand: dispatchAppPlatformCommand, prepareArchitectureCommand, syncArchitecturePluginInstances };
}

export type AppWorkspaceContext = ReturnType<typeof useAppWorkspaceContext>;
