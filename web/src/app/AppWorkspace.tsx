import { Component, lazy, Suspense, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { AppCommandPanel } from "@app/AppCommandPanel";
import { AppHeaderBar } from "@app/AppHeaderBar";
import { AppLibraryPanel } from "@app/AppLibraryPanel";
import { AppSideStack } from "@app/AppSideStack";
import { ContextTabs } from "@app/ContextTabs";
import { BootSelfCheckHud } from "@domains/boot-self-check/BootSelfCheckHud";
import { DiagnosticAgentPanel } from "@domains/diagnostic-agent/DiagnosticAgentPanel";
import type { AppWorkspaceContext } from "@app/useAppWorkspaceContext";

const ArchitectureWorkspacePage = lazy(async () => {
  const module = await import("@workspaces/architecture/ArchitectureWorkspacePage");
  return { default: module.ArchitectureWorkspacePage };
});

const ConsolePage = lazy(async () => {
  const module = await import("@workspaces/console/ConsolePage");
  return { default: module.ConsolePage };
});

const SimplePiRemotePage = lazy(async () => {
  const module = await import("@workspaces/pi/PiRemotePanels");
  return { default: module.SimplePiRemotePage };
});

const CanServoTestPage = lazy(async () => {
  const module = await import("@workspaces/can-servo/CanServoTestPage");
  return { default: module.CanServoTestPage };
});

const DrivePage = lazy(async () => {
  const module = await import("@workspaces/drive/DrivePage");
  return { default: module.DrivePage };
});

const ArmThreeSimulationPage = lazy(async () => {
  const module = await import("@domains/arm/ArmThreeSimulationPage");
  return { default: module.ArmThreeSimulationPage };
});

interface AppWorkspaceProps {
  ctx: AppWorkspaceContext;
}

interface WorkspaceErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
  resetKey: string;
}

interface WorkspaceErrorBoundaryState {
  error: Error | null;
}

class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps, WorkspaceErrorBoundaryState> {
  state: WorkspaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Workspace failed to render", error);
  }

  componentDidUpdate(previousProps: WorkspaceErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
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
    databaseStatus,
    debugEnabled,
    disconnectSerial,
    newProjectName,
    projects,
    selectSection,
    setNewProjectName,
    t,
    toggleDebugMode,
    webSerialAvailable,
    aiVision,
    bootSelfCheck,
    diagnosticAgent,
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
    applyArmConfig,
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
    primeArmForMotion,
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
    syncArchitecturePluginInstances,
    syncArchitectureSnapshot
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
        createNewProject={createNewProject}
        currentLanguage={currentLanguage}
        currentProject={currentProject}
        databaseStatus={databaseStatus}
        disconnectAboardSerialBridge={ctx.disconnectAboardSerialBridge}
        disconnectPiServoSerialBridge={ctx.disconnectPiServoSerialBridge}
        newProjectName={newProjectName}
        piRemoteBusy={piRemote.piRemoteBusy}
        piRemoteCanConnect={piRemote.canTestPiConnection}
        piRemoteStatus={piRemote.piRemoteStatus}
        piRemoteStatusTone={piRemote.piRemoteStatusTone}
        piRemoteTarget={`${piRemote.piRemoteForm.username || "robot1"}@${piRemote.piRemoteForm.host || "rescue-pi.local"}`}
        piServoBridgeBusy={ctx.piServoBridgeBusy}
        piServoBridgeConnected={ctx.piServoBridgeConnected}
        piServoBridgeDetail={ctx.piServoBridgeDetail}
        piServoBridgeLabel={ctx.piServoBridgeLabel}
        piServoBridgeTone={ctx.piServoBridgeTone}
        projects={projects}
        selectSection={selectSection}
        setNewProjectName={setNewProjectName}
        checkAboardSerialBridge={ctx.checkAboardSerialBridge}
        checkPiServoSerialBridge={ctx.checkPiServoSerialBridge}
        t={t}
        testRaspberryPiConnection={piRemote.testRaspberryPiConnection}
        webSerialAvailable={webSerialAvailable}
      />

      <div className={activeSection === "console" ? "workspace console-workspace" : "workspace"}>
        <WorkspaceErrorBoundary
          resetKey={`${activeSection}:${activeTest}`}
          fallback={(error) => (
            <section className="panel empty-state workspace-error-state">
              <strong>{t("loading.workspaceErrorTitle")}</strong>
              <span>{t("loading.workspaceErrorHint")}</span>
              {error.message && <code>{error.message}</code>}
              <button className="icon-button" onClick={() => window.location.reload()} type="button">
                <RotateCcw size={16} />
                <span>{t("actions.reloadPage")}</span>
              </button>
            </section>
          )}
        >
        {activeSection === "console" ? (
          <Suspense fallback={<div className="empty-state">{t("loading.console")}</div>}>
            <div className="console-diagnostic-layout">
              <BootSelfCheckHud runtime={bootSelfCheck} t={t} />
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
              <DiagnosticAgentPanel className="console-diagnostic-agent" runtime={diagnosticAgent} t={t} />
            </div>
          </Suspense>
        ) : activeSection === "plugins" || activeSection === "components" || activeSection === "robots" ? (
          <Suspense fallback={<div className="empty-state">{t("status.loading", { defaultValue: "Loading..." })}</div>}>
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
              onArchitectureChange={syncArchitectureSnapshot}
              onPluginInstancesChange={syncArchitecturePluginInstances}
              onPrepareCommand={prepareArchitectureCommand}
              piRemoteProfile={piRemote.piRemoteForm}
              sendAboardBridgeCanServoCommand={ctx.sendAboardBridgeCanServoCommand}
              servoFeedback={servoFeedback}
              t={t}
            />
          </Suspense>
        ) : (
          <>
            <ContextTabs
              activeModule={activeModule}
              activeModuleLabel={activeModuleLabel}
              activeSection={activeSection}
              activeSectionLabel={activeSectionLabel}
              activeTest={activeTest}
              connectSerial={connectSerial}
              connected={connected}
              debugEnabled={debugEnabled}
              disconnectSerial={disconnectSerial}
              selectModule={selectModule}
              selectTestPanel={selectTestPanel}
              t={t}
              toggleDebugMode={toggleDebugMode}
            />
            {activeSection === "tests" && activeTest === "pi" ? (
              <Suspense fallback={<div className="empty-state">{t("status.loading", { defaultValue: "Loading..." })}</div>}>
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
              </Suspense>
            ) : activeSection === "tests" && activeTest === "canServo" ? (
              <Suspense fallback={<div className="empty-state">{t("status.loading", { defaultValue: "Loading..." })}</div>}>
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
              </Suspense>
            ) : activeSection === "tests" && activeTest === "arm3d" ? (
              <Suspense fallback={<div className="empty-state">{t("loading.arm3d")}</div>}>
                <ArmThreeSimulationPage
                  addArmJoint={addArmJoint}
                  applyArmConfig={applyArmConfig}
                  armConfig={armConfig}
                  armSegmentPoses={armSegmentPoses}
                  armServoForJoint={armServoForJoint}
                  pauseArm={pauseArm}
                  primeArmForMotion={primeArmForMotion}
                  sendArmPose={sendArmPose}
                  servos={servos}
                  servoBusConnected={servoBusConnected}
                  setArmLiveDragEnabled={setArmLiveDragEnabled}
                  t={t}
                  updateArmJoint={updateArmJoint}
                  updateArmJointNumber={updateArmJointNumber}
                  updateArmJointServo={updateArmJointServo}
                />
              </Suspense>
            ) : activeSection === "tests" && activeTest === "driveCamera" ? (
              <Suspense fallback={<div className="empty-state">{t("status.loading", { defaultValue: "Loading..." })}</div>}>
                <DrivePage
                  activeDriveBase={activeDriveBase}
                  activeCameraSource={activeCameraSource}
                  activeGamepad={activeGamepad}
                  aiVision={aiVision}
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
              </Suspense>
            ) : (
              <>
        <AppLibraryPanel ctx={ctx} />

        <AppCommandPanel ctx={ctx} />

        <AppSideStack ctx={ctx} />
              </>
            )}
          </>
        )}
        </WorkspaceErrorBoundary>
      </div>
    </main>
  );
}
