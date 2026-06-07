import { CanServoTestPage } from "../features/canServo/CanServoTestPage";
import { DrivePage } from "../features/drive/DrivePage";
import { SimplePiRemotePage } from "../features/pi/PiRemotePanels";
import { lazy, Suspense } from "react";
import { AppCommandPanel } from "./AppCommandPanel";
import { AppHeaderBar } from "./AppHeaderBar";
import { AppLibraryPanel } from "./AppLibraryPanel";
import { AppSideStack } from "./AppSideStack";
import { ArchitectureWorkspacePage } from "./ArchitectureWorkspacePage";
import { ContextTabs } from "./ContextTabs";
import type { AppWorkspaceContext } from "./useAppWorkspaceContext";

const ConsolePage = lazy(async () => {
  const module = await import("../features/console/ConsolePage");
  return { default: module.ConsolePage };
});

const ArmThreeSimulationPage = lazy(async () => {
  const module = await import("../features/arm/ArmThreeSimulationPage");
  return { default: module.ArmThreeSimulationPage };
});

interface AppWorkspaceProps {
  ctx: AppWorkspaceContext;
}

export function AppWorkspace({ ctx }: AppWorkspaceProps) {
  const {
    activeModule,
    activeModuleLabel,
    activeSection,
    changeCurrentProject,
    changeLanguage,
    connectSerial,
    connected,
    createNewProject,
    currentLanguage,
    currentProject,
    databaseDetailValue,
    databaseStatus,
    databaseStatusValue,
    debugEnabled,
    debugLabel,
    disconnectSerial,
    newProjectName,
    projectStatusValue,
    projects,
    selectSection,
    setNewProjectName,
    t,
    toggleDebugMode,
    webSerialAvailable,
    activeDriveBase,
    activeGamepad,
    activeSectionLabel,
    renderArmCanvas,
    cameraPreviewCommand,
    cameraStreamFailed,
    cameraStreamLoaded,
    cameraStreamUrl,
    completeMotorMappingCount,
    driveCanCommand,
    driveInput,
    drivePreviewCommand,
    handleVirtualStickDown,
    handleVirtualStickMove,
    logs,
    motors,
    resetVirtualStick,
    selectDriveBase,
    servos,
    servoFeedback,
    aBoardBridgeBusy,
    aBoardBridgeConnected,
    aBoardImuAttitude,
    aBoardImuCalibration,
    aBoardImuCalibrationStatus,
    aBoardImuError,
    aBoardImuFeedback,
    checkAboardSerialBridge,
    startAboardImuCalibration,
    stopAllMotors,
    activeTest,
    selectModule,
    selectTestPanel,
    piRemote,
    activeCameraSource,
    cameraCanCommand,
    cameraConfig,
    cameraConfigError,
    cameraSourceRuntimeById,
    cameraStreamReloadToken,
    cameraValidationError,
    cameraVideoSources,
    centerCamera,
    driveSpeedLimit,
    driveTargets,
    nudgeCamera,
    saveCameraSettings,
    setCameraSourceRuntime,
    setDriveSpeedLimit,
    setStopMode,
    speedLimitPercent,
    stopMode,
    updateCameraActiveSource,
    updateCameraLatencyProfile,
    updateCameraNumber,
    updateCameraSourcePort,
    updateCameraSourceText,
    updateCameraStreamMode,
    updateCameraText,
    updateCameraVideoLayout,
    activeModuleMeta,
    renderPlatformPanel,
    applyGamepadPresetToDraft,
    gamepads,
    mappingDraft,
    recommendedGamepadPreset,
    resetMappingSettings,
    saveMappingSettings,
    savedGamepadIsCustom,
    selectedGamepadIndex,
    selectedGamepadPreset,
    setSelectedGamepadIndex,
    setSelectedGamepadPreset,
    updateGamepadDeadzone,
    addArmJoint,
    armConfig,
    armServoForJoint,
    moveArmJoint,
    removeArmJoint,
    setArmConfig,
    addServo,
    addServoLinkageGroup,
    addServoToLinkageGroup,
    expandedServoLinkageGroupIds,
    removeServo,
    removeServoFromLinkageGroup,
    removeServoLinkageGroup,
    selectedId,
    servoDraft,
    servoLibraryError,
    servoLinkageGroups,
    setSelectedId,
    setServoDraft,
    toggleServoLinkageGroupExpanded,
    updateServoDirection,
    updateServoLimit,
    updateServoLinkageGroupEnabled,
    updateServoLinkageGroupMode,
    updateServoLinkageGroupName,
    updateServoLinkageMemberNumber,
    updateServoLinkageMemberReverse,
    updateServoLinkageMemberWeight,
    updateServoLinkageWheelTurnLimit,
    updateServoLinkageWheelTurnTarget,
    addMotor,
    addMotorLinkageGroup,
    addMotorToLinkageGroup,
    expandedMotorLinkageGroupIds,
    motorDraft,
    motorFeedback,
    motorLibraryError,
    motorLinkageGroups,
    motorPinSummary,
    removeMotor,
    removeMotorFromLinkageGroup,
    removeMotorLinkageGroup,
    selectedChannel,
    setMotorDraft,
    setSelectedChannel,
    toggleMotorLinkageGroupExpanded,
    updateMotorLinkageGroupEnabled,
    updateMotorLinkageGroupName,
    updateMotorLinkageMemberReverse,
    updateMotorLinkageMemberWeight,
    armSegmentPoses,
    calculateArmMotionTargets,
    pauseArm,
    selectedArmJoint,
    sendArmPose,
    setArmLiveDragEnabled,
    armTeachDraftName,
    armTeachDraftNotes,
    armTeachElapsedMs,
    armTeachLastSampleStatus,
    armTeachSampleCount,
    armTeachStatus,
    armTeachTracks,
    armTeachUnsavedTrack,
    exportArmTeachTrack,
    getEnabledArmTeachJoints,
    pauseArmTeachPlayback,
    playArmTeachTrack,
    removeSelectedArmTeachTrack,
    saveCurrentArmTeachTrack,
    selectedArmTeachTrack,
    servoBusConnected,
    setArmTeachDraftName,
    setArmTeachDraftNotes,
    setSelectedArmTeachTrackId,
    startArmTeachRecording,
    stopArmTeachRecording,
    updateArmJoint,
    updateArmJointNumber,
    updateArmJointServo,
    capturingKey,
    setCapturingKey,
    updateGamepadAxis,
    updateGamepadButton,
    updateKeyboardMapping,
    cancelServoMotion,
    currentServoSafetyConfig,
    currentServoSmoothConfig,
    enabledServoLinkageGroups,
    formatLinkageMemberDirection,
    formatWheelSliderDirectionLabel,
    handleAngleSliderChange,
    handleLiveDragToggle,
    handleServoModeChange,
    handleWheelSliderChange,
    linkageWheelDirectionByGroup,
    pauseServo,
    pauseServoLinkageGroup,
    pingServo,
    readServo,
    sendMoveForServo,
    sendServoLinkageGroup,
    sendServoLinkageWheelGroup,
    servoCommandById,
    servoMotionStatusById,
    servoSafetyEnabled,
    servoSafetyPreset,
    servoSafetyStatusById,
    servoSafetyStatusLabel,
    servoSafetyStatusTone,
    servoSmoothPreset,
    servoSmoothingEnabled,
    setServoSafetyEnabled,
    setServoSafetyPreset,
    setServoSmoothPreset,
    setServoSmoothingEnabled,
    setTorqueForServo,
    updateServoCommandField,
    updateServoLinkageMaster,
    updateServoLogicalAngle,
    updateServoWheelMaxSpeed,
    updateServoWheelSlider,
    wheelTurnProgress,
    canCompileFirmware,
    canUploadFirmware,
    checkFirmwareHelper,
    compileArduinoFirmware,
    connectionMode,
    downloadArduinoFirmware,
    enabledMotorLinkageGroups,
    firmwareBoard,
    firmwareBusy,
    firmwareError,
    firmwareHelperHealth,
    firmwareHelperLabel,
    firmwareHelperTone,
    firmwareHexLabel,
    firmwareLogs,
    firmwarePorts,
    firmwareStatus,
    firmwareStatusTone,
    formatDirectionLabel,
    lastMotorError,
    lastMotorErrorLabel,
    motorConfigError,
    motorDebugHandshakeLabel,
    motorDebugHandshakeTone,
    motorDirection,
    motorDuty,
    motorPreviewCommand,
    motorSpeed,
    numericMotorSpeed,
    readMotor,
    refreshFirmwarePorts,
    saveMotorMapping,
    selectedFirmwarePort,
    selectedMotor,
    selectedServo,
    sendMotorConfig,
    sendMotorLinkageGroup,
    sendMotorSet,
    setFirmwareBoard,
    setFirmwareJob,
    setFirmwareStatus,
    setSelectedFirmwarePort,
    stopMotor,
    stopMotorLinkageGroup,
    updateMotorLinkageMaster,
    updateSelectedMotorMapping,
    updateSingleMotorSpeed,
    uploadCompiledArduinoFirmware,
    selectedArmFeedback,
    metricNumber,
    architecturePluginInstances,
    dispatchPlatformCommand,
    prepareArchitectureCommand,
    syncArchitecturePluginInstances
  } = ctx;

  return (
    <main className="app-shell">
      <AppHeaderBar
        aBoardBridgeBusy={ctx.aBoardBridgeBusy}
        aBoardBridgeConnected={ctx.aBoardBridgeConnected}
        aBoardBridgeDetail={ctx.aBoardBridgeDetail}
        aBoardBridgeLabel={ctx.aBoardBridgeLabel}
        aBoardBridgeTone={ctx.aBoardBridgeTone}
        activeModule={activeModule}
        activeModuleLabel={activeModuleLabel}
        activeSection={activeSection}
        changeCurrentProject={changeCurrentProject}
        changeLanguage={changeLanguage}
        connectSerial={connectSerial}
        connected={connected}
        createNewProject={createNewProject}
        currentLanguage={currentLanguage}
        currentProject={currentProject}
        databaseDetailValue={databaseDetailValue}
        databaseStatus={databaseStatus}
        databaseStatusValue={databaseStatusValue}
        debugEnabled={debugEnabled}
        debugLabel={debugLabel}
        disconnectAboardSerialBridge={ctx.disconnectAboardSerialBridge}
        disconnectPiServoSerialBridge={ctx.disconnectPiServoSerialBridge}
        disconnectSerial={disconnectSerial}
        newProjectName={newProjectName}
        piRemoteBusy={piRemote.piRemoteBusy}
        piRemoteCanConnect={piRemote.canTestPiConnection}
        piRemoteStatus={piRemote.piRemoteStatus}
        piRemoteStatusTone={piRemote.piRemoteStatusTone}
        piRemoteTarget={`${piRemote.piRemoteForm.username || "robot1"}@${piRemote.piRemoteForm.host || "raspberrypi.local"}`}
        piServoBridgeBusy={ctx.piServoBridgeBusy}
        piServoBridgeConnected={ctx.piServoBridgeConnected}
        piServoBridgeDetail={ctx.piServoBridgeDetail}
        piServoBridgeLabel={ctx.piServoBridgeLabel}
        piServoBridgeTone={ctx.piServoBridgeTone}
        projectStatusValue={projectStatusValue}
        projects={projects}
        selectSection={selectSection}
        setNewProjectName={setNewProjectName}
        startAboardSerialBridge={ctx.startAboardSerialBridge}
        startPiServoSerialBridge={ctx.startPiServoSerialBridge}
        t={t}
        testRaspberryPiConnection={piRemote.testRaspberryPiConnection}
        toggleDebugMode={toggleDebugMode}
        webSerialAvailable={webSerialAvailable}
      />

      <div className={activeSection === "console" ? "workspace console-workspace" : "workspace"}>
        {activeSection === "console" ? (
          <Suspense fallback={<div className="empty-state">Loading console...</div>}>
            <ConsolePage
              aBoardBridgeBusy={aBoardBridgeBusy}
              aBoardBridgeConnected={aBoardBridgeConnected}
              aBoardImuAttitude={aBoardImuAttitude}
              aBoardImuCalibration={aBoardImuCalibration}
              aBoardImuCalibrationStatus={aBoardImuCalibrationStatus}
              aBoardImuError={aBoardImuError}
              aBoardImuFeedback={aBoardImuFeedback}
              checkAboardSerialBridge={checkAboardSerialBridge}
              activeDriveBase={activeDriveBase}
              activeGamepad={activeGamepad}
              activeSectionLabel={activeSectionLabel}
              architecturePluginInstances={architecturePluginInstances}
              armConfig={armConfig}
              armSegmentPoses={armSegmentPoses}
              cameraConfig={cameraConfig}
              cameraPreviewCommand={cameraPreviewCommand}
              cameraSourceRuntimeById={cameraSourceRuntimeById}
              cameraStreamReloadToken={cameraStreamReloadToken}
              cameraVideoSources={cameraConfig.videoSources}
              completeMotorMappingCount={completeMotorMappingCount}
              connected={connected}
              currentProject={currentProject}
              dataServiceOnline={databaseStatus !== "offline"}
              driveCanCommand={driveCanCommand}
              driveInput={driveInput}
              drivePreviewCommand={drivePreviewCommand}
              handleVirtualStickDown={handleVirtualStickDown}
              handleVirtualStickMove={handleVirtualStickMove}
              logs={logs}
              motorCount={motors.length}
              piRemote={piRemote}
              resetVirtualStick={resetVirtualStick}
              selectDriveBase={selectDriveBase}
              servoCount={servos.length}
              servoFeedback={servoFeedback}
              setCameraSourceRuntime={setCameraSourceRuntime}
              startAboardImuCalibration={startAboardImuCalibration}
              stopAllMotors={stopAllMotors}
              t={t}
            />
          </Suspense>
        ) : activeSection === "plugins" || activeSection === "components" || activeSection === "robots" ? (
          <ArchitectureWorkspacePage
            aBoardBridge={{
              busy: ctx.aBoardBridgeBusy,
              connected: ctx.aBoardBridgeConnected,
              detail: ctx.aBoardBridgeDetail,
              error: ctx.aBoardBridgeError,
              label: ctx.aBoardBridgeLabel,
              tone: ctx.aBoardBridgeTone,
              check: ctx.checkAboardSerialBridge,
              disconnect: ctx.disconnectAboardSerialBridge,
              start: ctx.startAboardSerialBridge
            }}
            activeSection={activeSection}
            canServoHost={piRemote.piRemoteForm.host}
            currentProject={currentProject}
            databaseStatus={databaseStatus}
            dispatchPlatformCommand={dispatchPlatformCommand}
            driveTargets={driveTargets}
            gamepads={gamepads}
            motorFeedback={motorFeedback}
            nextCommandSeq={ctx.nextCommandSeq}
            onPluginInstancesChange={syncArchitecturePluginInstances}
            onPrepareCommand={prepareArchitectureCommand}
            piRemoteProfile={piRemote.piRemoteForm}
            sendAboardBridgeCanServoCommand={ctx.sendAboardBridgeCanServoCommand}
            servoFeedback={servoFeedback}
            t={t}
          />
        ) : (
          <>
            <ContextTabs
              activeModuleLabel={activeModuleLabel}
              activeSection={activeSection}
              activeSectionLabel={activeSectionLabel}
              activeTest={activeTest}
              selectModule={selectModule}
              selectTestPanel={selectTestPanel}
              t={t}
            />
            {activeSection === "tests" && activeTest === "pi" ? (
              <SimplePiRemotePage
                aBoardBridge={{
                  busy: ctx.aBoardBridgeBusy,
                  connected: ctx.aBoardBridgeConnected,
                  detail: ctx.aBoardBridgeDetail,
                  error: ctx.aBoardBridgeError,
                  label: ctx.aBoardBridgeLabel,
                  tone: ctx.aBoardBridgeTone,
                  check: ctx.checkAboardSerialBridge,
                  disconnect: ctx.disconnectAboardSerialBridge,
                  start: ctx.startAboardSerialBridge
                }}
                piServoBridge={{
                  busy: ctx.piServoBridgeBusy,
                  connected: ctx.piServoBridgeConnected,
                  detail: ctx.piServoBridgeDetail,
                  error: ctx.piServoBridgeError,
                  label: ctx.piServoBridgeLabel,
                  tone: ctx.piServoBridgeTone,
                  check: ctx.checkPiServoSerialBridge,
                  disconnect: ctx.disconnectPiServoSerialBridge,
                  start: ctx.startPiServoSerialBridge
                }}
                runtime={piRemote}
                t={t}
              />
            ) : activeSection === "tests" && activeTest === "canServo" ? (
              <CanServoTestPage
                aBoardBridge={{
                  busy: ctx.aBoardBridgeBusy,
                  connected: ctx.aBoardBridgeConnected,
                  detail: ctx.aBoardBridgeDetail,
                  error: ctx.aBoardBridgeError,
                  label: ctx.aBoardBridgeLabel,
                  tone: ctx.aBoardBridgeTone,
                  check: ctx.checkAboardSerialBridge,
                  disconnect: ctx.disconnectAboardSerialBridge,
                  start: ctx.startAboardSerialBridge
                }}
                host={piRemote.piRemoteForm.host}
                nextCommandSeq={ctx.nextCommandSeq}
                sendAboardBridgeCanServoCommand={ctx.sendAboardBridgeCanServoCommand}
                t={t}
              />
            ) : activeSection === "tests" && activeTest === "arm3d" ? (
              <Suspense fallback={<div className="empty-state">Loading 3D arm...</div>}>
                <ArmThreeSimulationPage
                  armConfig={armConfig}
                  armSegmentPoses={armSegmentPoses}
                  armServoForJoint={armServoForJoint}
                  pauseArm={pauseArm}
                  sendArmPose={sendArmPose}
                  servoBusConnected={servoBusConnected}
                  setArmLiveDragEnabled={setArmLiveDragEnabled}
                  t={t}
                  updateArmJoint={updateArmJoint}
                  updateArmJointNumber={updateArmJointNumber}
                />
              </Suspense>
            ) : activeSection === "tests" && activeTest === "driveCamera" ? (
              <DrivePage
                activeDriveBase={activeDriveBase}
                activeCameraSource={activeCameraSource}
                activeGamepad={activeGamepad}
                cameraCanCommand={cameraCanCommand}
                cameraConfig={cameraConfig}
                cameraConfigError={cameraConfigError}
                cameraPreviewCommand={cameraPreviewCommand}
                cameraSourceRuntimeById={cameraSourceRuntimeById}
                cameraStreamReloadToken={cameraStreamReloadToken}
                cameraStreamFailed={cameraStreamFailed}
                cameraStreamLoaded={cameraStreamLoaded}
                cameraStreamUrl={cameraStreamUrl}
                cameraValidationError={cameraValidationError}
                cameraVideoSources={cameraVideoSources}
                centerCamera={centerCamera}
                connected={connected}
                debugEnabled={debugEnabled}
                driveCanCommand={driveCanCommand}
                driveInput={driveInput}
                drivePreviewCommand={drivePreviewCommand}
                driveSpeedLimit={driveSpeedLimit}
                driveTargets={driveTargets}
                nudgeCamera={nudgeCamera}
                piRemote={piRemote}
                saveCameraSettings={saveCameraSettings}
                selectDriveBase={selectDriveBase}
                setCameraSourceRuntime={setCameraSourceRuntime}
                setDriveSpeedLimit={setDriveSpeedLimit}
                setStopMode={setStopMode}
                speedLimitPercent={speedLimitPercent}
                stopAllMotors={stopAllMotors}
                stopMode={stopMode}
                t={t}
                updateCameraActiveSource={updateCameraActiveSource}
                updateCameraLatencyProfile={updateCameraLatencyProfile}
                updateCameraNumber={updateCameraNumber}
                updateCameraSourcePort={updateCameraSourcePort}
                updateCameraSourceText={updateCameraSourceText}
                updateCameraStreamMode={updateCameraStreamMode}
                updateCameraText={updateCameraText}
                updateCameraVideoLayout={updateCameraVideoLayout}
              />
            ) : (
              <>
        <AppLibraryPanel ctx={ctx} />

        <AppCommandPanel ctx={ctx} />

        <AppSideStack ctx={ctx} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
