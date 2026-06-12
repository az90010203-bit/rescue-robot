import { Gauge, SlidersHorizontal } from "lucide-react";
import { InputMappingCommandPanel } from "@domains/drive/InputMappingPanels";
import { MotorCommandPanel } from "@domains/motor/MotorCommandPanel";
import { ServoCommandPanel } from "@domains/servo/ServoCommandPanel";
import { ArmJointEditor } from "@domains/arm/ArmPanels";
import { ArmKinematicsPanel } from "@domains/arm/ArmKinematicsPanel";
import { ArmTeachPanel } from "@domains/arm/ArmTeachPanel";
import { PanelTitle } from "@shared/ui/AppChrome";
import type { AppWorkspaceContext } from "@app/useAppWorkspaceContext";

interface AppCommandPanelProps {
  ctx: AppWorkspaceContext;
}

export function AppCommandPanel({ ctx }: AppCommandPanelProps) {
  const {
    activeModule,
    armConfig,
    armSegmentPoses,
    armServoForJoint,
    armTeachDraftName,
    armTeachDraftNotes,
    armTeachElapsedMs,
    armTeachLastSampleStatus,
    armTeachSampleCount,
    armTeachStatus,
    armTeachTracks,
    armTeachUnsavedTrack,
    aBoardBridgeConnected,
    aBoardBridgeDetail,
    aBoardBridgeError,
    aBoardBridgeLabel,
    aBoardBridgeTone,
    calculateArmMotionTargets,
    cancelServoMotion,
    capturingKey,
    connected,
    currentServoSafetyConfig,
    currentServoSmoothConfig,
    debugEnabled,
    enabledMotorLinkageGroups,
    enabledServoLinkageGroups,
    exportArmTeachTrack,
    formatDirectionLabel,
    formatLinkageMemberDirection,
    formatWheelSliderDirectionLabel,
    getEnabledArmTeachJoints,
    handleAngleSliderChange,
    handleLiveDragToggle,
    handleServoModeChange,
    handleWheelSliderChange,
    linkageWheelDirectionByGroup,
    mappingDraft,
    motorConfigError,
    motorDirection,
    motorDuty,
    motorControllerReady,
    motorFeedback,
    motorPreviewCommand,
    motorSpeed,
    motors,
    numericMotorSpeed,
    pauseArm,
    pauseArmTeachPlayback,
    pauseServo,
    pauseServoLinkageGroup,
    piServoBridgeDetail,
    piServoBridgeError,
    piServoBridgeLabel,
    piServoBridgeTone,
    pingServo,
    playArmTeachTrack,
    readMotor,
    readServo,
    removeSelectedArmTeachTrack,
    renderArmCanvas,
    runArmTuningProbe,
    saveCurrentArmTeachTrack,
    saveMotorMapping,
    selectedArmJoint,
    selectedArmTeachTrack,
    selectedChannel,
    selectedId,
    selectedMotor,
    sendArmPose,
    sendMotorConfig,
    sendMotorLinkageGroup,
    sendMotorSet,
    sendMoveForServo,
    sendServoLinkageGroup,
    sendServoLinkageWheelGroup,
    servoBusConnected,
    servoCommandById,
    servoFeedback,
    servoMotionStatusById,
    servoSafetyEnabled,
    servoSafetyPreset,
    servoSafetyStatusById,
    servoSafetyStatusLabel,
    servoSafetyStatusTone,
    servoSmoothPreset,
    servoSmoothingEnabled,
    servos,
    setArmConfig,
    setArmLiveDragEnabled,
    setArmTeachDraftName,
    setArmTeachDraftNotes,
    setCapturingKey,
    setSelectedArmTeachTrackId,
    setSelectedChannel,
    setSelectedId,
    setServoSafetyEnabled,
    setServoSafetyPreset,
    setServoSmoothPreset,
    setServoSmoothingEnabled,
    setStopMode,
    setTorqueForServo,
    startArmTeachRecording,
    stopAllMotors,
    stopArmTeachRecording,
    stopMode,
    stopMotor,
    stopMotorLinkageGroup,
    t,
    updateArmJoint,
    updateArmJointNumber,
    updateArmJointServo,
    updateGamepadAxis,
    updateGamepadButton,
    updateKeyboardMapping,
    updateMotorLinkageMaster,
    updateSelectedMotorMapping,
    updateServoCommandField,
    updateServoLinkageMaster,
    updateServoLogicalAngle,
    updateServoWheelMaxSpeed,
    updateServoWheelSlider,
    updateSingleMotorSpeed,
    wheelTurnProgress
  } = ctx;

  return (
            <section className="panel command-panel" aria-labelledby="command-title">
              <PanelTitle
                icon={activeModule === "mapping" ? <SlidersHorizontal size={18} /> : <Gauge size={18} />}
                id="command-title"
                meta={debugEnabled ? t("status.debugActive") : t("status.standby")}
                title={
                  activeModule === "servo"
                    ? t("panels.servoCommand")
                    : activeModule === "arm"
                      ? t("panels.armControl")
                      : activeModule === "motor"
                        ? t("panels.motorCommand")
                        : activeModule === "mapping"
                          ? t("panels.inputMapping")
                          : t("panels.driveCamera")
                }
              />
    
              {activeModule === "arm" ? (
                <ArmJointEditor
                  armCanvas={renderArmCanvas()}
                  armConfig={armConfig}
                  armSegmentPoses={armSegmentPoses}
                  armServoForJoint={armServoForJoint}
                  calculateArmMotionTargets={calculateArmMotionTargets}
                  kinematicsPanel={
                    <ArmKinematicsPanel
                      armConfig={armConfig}
                      runArmTuningProbe={runArmTuningProbe}
                      servoBusConnected={servoBusConnected}
                      servoFeedback={servoFeedback}
                      servoSafetyEnabled={servoSafetyEnabled}
                      servos={servos}
                      setArmConfig={setArmConfig}
                      t={t}
                    />
                  }
                  pauseArm={pauseArm}
                  selectedArmJoint={selectedArmJoint}
                  sendArmPose={sendArmPose}
                  servos={servos}
                  setArmLiveDragEnabled={setArmLiveDragEnabled}
                  t={t}
                  teachPanel={
                    <ArmTeachPanel
                      armTeachDraftName={armTeachDraftName}
                      armTeachDraftNotes={armTeachDraftNotes}
                      armTeachElapsedMs={armTeachElapsedMs}
                      armTeachLastSampleStatus={armTeachLastSampleStatus}
                      armTeachSampleCount={armTeachSampleCount}
                      armTeachStatus={armTeachStatus}
                      armTeachTracks={armTeachTracks}
                      armTeachUnsavedTrack={armTeachUnsavedTrack}
                      exportArmTeachTrack={exportArmTeachTrack}
                      getEnabledArmTeachJoints={getEnabledArmTeachJoints}
                      pauseArmTeachPlayback={pauseArmTeachPlayback}
                      playArmTeachTrack={playArmTeachTrack}
                      removeSelectedArmTeachTrack={removeSelectedArmTeachTrack}
                      saveCurrentArmTeachTrack={saveCurrentArmTeachTrack}
                      selectedArmTeachTrack={selectedArmTeachTrack}
                      servoBusConnected={servoBusConnected}
                      setArmTeachDraftName={setArmTeachDraftName}
                      setArmTeachDraftNotes={setArmTeachDraftNotes}
                      setSelectedArmTeachTrackId={setSelectedArmTeachTrackId}
                      startArmTeachRecording={startArmTeachRecording}
                      stopArmTeachRecording={stopArmTeachRecording}
                    />
                  }
                  updateArmJoint={updateArmJoint}
                  updateArmJointNumber={updateArmJointNumber}
                  updateArmJointServo={updateArmJointServo}
                />
              ) : activeModule === "mapping" ? (
                <InputMappingCommandPanel
                  capturingKey={capturingKey}
                  mappingDraft={mappingDraft}
                  setCapturingKey={setCapturingKey}
                  t={t}
                  updateGamepadAxis={updateGamepadAxis}
                  updateGamepadButton={updateGamepadButton}
                  updateKeyboardMapping={updateKeyboardMapping}
                />
              ) : activeModule === "servo" ? (
                <ServoCommandPanel
                  cancelServoMotion={cancelServoMotion}
                  currentServoSafetyConfig={currentServoSafetyConfig}
                  currentServoSmoothConfig={currentServoSmoothConfig}
                  enabledServoLinkageGroups={enabledServoLinkageGroups}
                  formatLinkageMemberDirection={formatLinkageMemberDirection}
                  formatWheelSliderDirectionLabel={formatWheelSliderDirectionLabel}
                  handleAngleSliderChange={handleAngleSliderChange}
                  handleLiveDragToggle={handleLiveDragToggle}
                  handleServoModeChange={handleServoModeChange}
                  handleWheelSliderChange={handleWheelSliderChange}
                  linkageWheelDirectionByGroup={linkageWheelDirectionByGroup}
                  pauseServo={pauseServo}
                  pauseServoLinkageGroup={pauseServoLinkageGroup}
                  piServoBridgeDetail={piServoBridgeDetail}
                  piServoBridgeError={piServoBridgeError}
                  piServoBridgeLabel={piServoBridgeLabel}
                  piServoBridgeTone={piServoBridgeTone}
                  pingServo={pingServo}
                  readServo={readServo}
                  selectedId={selectedId}
                  sendMoveForServo={sendMoveForServo}
                  sendServoLinkageGroup={sendServoLinkageGroup}
                  sendServoLinkageWheelGroup={sendServoLinkageWheelGroup}
                  servoCommandById={servoCommandById}
                  servoFeedback={servoFeedback}
                  servoMotionStatusById={servoMotionStatusById}
                  servoSafetyEnabled={servoSafetyEnabled}
                  servoSafetyPreset={servoSafetyPreset}
                  servoSafetyStatusById={servoSafetyStatusById}
                  servoSafetyStatusLabel={servoSafetyStatusLabel}
                  servoSafetyStatusTone={servoSafetyStatusTone}
                  servoSmoothPreset={servoSmoothPreset}
                  servoSmoothingEnabled={servoSmoothingEnabled}
                  servos={servos}
                  setSelectedId={setSelectedId}
                  setServoSafetyEnabled={setServoSafetyEnabled}
                  setServoSafetyPreset={setServoSafetyPreset}
                  setServoSmoothPreset={setServoSmoothPreset}
                  setServoSmoothingEnabled={setServoSmoothingEnabled}
                  setTorqueForServo={setTorqueForServo}
                  t={t}
                  updateServoCommandField={updateServoCommandField}
                  updateServoLinkageMaster={updateServoLinkageMaster}
                  updateServoLogicalAngle={updateServoLogicalAngle}
                  updateServoWheelMaxSpeed={updateServoWheelMaxSpeed}
                  updateServoWheelSlider={updateServoWheelSlider}
                  wheelTurnProgress={wheelTurnProgress}
                />
              ) : (
                <MotorCommandPanel
                  aBoardBridgeConnected={aBoardBridgeConnected}
                  aBoardBridgeDetail={aBoardBridgeDetail}
                  aBoardBridgeError={aBoardBridgeError}
                  aBoardBridgeLabel={aBoardBridgeLabel}
                  aBoardBridgeTone={aBoardBridgeTone}
                  enabledMotorLinkageGroups={enabledMotorLinkageGroups}
                  formatDirectionLabel={formatDirectionLabel}
                  formatLinkageMemberDirection={formatLinkageMemberDirection}
                  motorConfigError={motorConfigError}
                  motorDirection={motorDirection}
                  motorDuty={motorDuty}
                  motorControllerReady={motorControllerReady}
                  motorFeedback={motorFeedback}
                  motorPreviewCommand={motorPreviewCommand}
                  motorSpeed={motorSpeed}
                  motors={motors}
                  numericMotorSpeed={numericMotorSpeed}
                  readMotor={readMotor}
                  saveMotorMapping={saveMotorMapping}
                  selectedChannel={selectedChannel}
                  selectedMotor={selectedMotor}
                  sendMotorConfig={sendMotorConfig}
                  sendMotorLinkageGroup={sendMotorLinkageGroup}
                  sendMotorSet={sendMotorSet}
                  setSelectedChannel={setSelectedChannel}
                  setStopMode={setStopMode}
                  stopAllMotors={stopAllMotors}
                  stopMode={stopMode}
                  stopMotor={stopMotor}
                  stopMotorLinkageGroup={stopMotorLinkageGroup}
                  t={t}
                  updateMotorLinkageMaster={updateMotorLinkageMaster}
                  updateSelectedMotorMapping={updateSelectedMotorMapping}
                  updateSingleMotorSpeed={updateSingleMotorSpeed}
                />
              )}
            </section>
  );
}
