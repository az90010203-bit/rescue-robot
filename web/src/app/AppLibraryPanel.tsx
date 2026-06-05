import { ListPlus } from "lucide-react";
import { InputMappingSettingsPanel } from "../features/drive/InputMappingPanels";
import { MotorLibraryPanel } from "../features/motor/MotorLibraryPanel";
import { ServoLibraryPanel } from "../features/servo/ServoLibraryPanel";
import { ArmLibrary } from "../features/arm/ArmPanels";
import { PanelTitle } from "../shared/ui/AppChrome";
import type { AppWorkspaceContext } from "./useAppWorkspaceContext";

interface AppLibraryPanelProps {
  ctx: AppWorkspaceContext;
}

export function AppLibraryPanel({ ctx }: AppLibraryPanelProps) {
  const {
    activeGamepad,
    activeModule,
    activeModuleMeta,
    addArmJoint,
    addMotor,
    addMotorLinkageGroup,
    addMotorToLinkageGroup,
    addServo,
    addServoLinkageGroup,
    addServoToLinkageGroup,
    applyGamepadPresetToDraft,
    armConfig,
    armServoForJoint,
    expandedMotorLinkageGroupIds,
    expandedServoLinkageGroupIds,
    gamepads,
    mappingDraft,
    motorDraft,
    motorFeedback,
    motorLibraryError,
    motorLinkageGroups,
    motorPinSummary,
    motors,
    moveArmJoint,
    recommendedGamepadPreset,
    removeArmJoint,
    removeMotor,
    removeMotorFromLinkageGroup,
    removeMotorLinkageGroup,
    removeServo,
    removeServoFromLinkageGroup,
    removeServoLinkageGroup,
    renderPlatformPanel,
    resetMappingSettings,
    saveMappingSettings,
    savedGamepadIsCustom,
    selectedChannel,
    selectedGamepadIndex,
    selectedGamepadPreset,
    selectedId,
    servoDraft,
    servoFeedback,
    servoLibraryError,
    servoLinkageGroups,
    servos,
    setArmConfig,
    setMotorDraft,
    setSelectedChannel,
    setSelectedGamepadIndex,
    setSelectedGamepadPreset,
    setSelectedId,
    setServoDraft,
    t,
    toggleMotorLinkageGroupExpanded,
    toggleServoLinkageGroupExpanded,
    updateGamepadDeadzone,
    updateMotorLinkageGroupEnabled,
    updateMotorLinkageGroupName,
    updateMotorLinkageMemberReverse,
    updateMotorLinkageMemberWeight,
    updateServoDirection,
    updateServoLimit,
    updateServoLinkageGroupEnabled,
    updateServoLinkageGroupMode,
    updateServoLinkageGroupName,
    updateServoLinkageMemberNumber,
    updateServoLinkageMemberReverse,
    updateServoLinkageMemberWeight,
    updateServoLinkageWheelTurnLimit,
    updateServoLinkageWheelTurnTarget
  } = ctx;

  return (
            <section className="panel library-panel" aria-labelledby="device-library-title">
              <PanelTitle
                icon={<ListPlus size={18} />}
                id="device-library-title"
                meta={activeModuleMeta}
                title={
                  activeModule === "servo"
                    ? t("panels.servoLibrary")
                    : activeModule === "arm"
                      ? t("panels.armJoints")
                      : activeModule === "motor"
                        ? t("panels.motorLibrary")
                        : activeModule === "mapping"
                          ? t("panels.inputSettings")
                          : t("panels.cameraSettings")
                }
              />
    
              {renderPlatformPanel("deviceTree")}
    
              {activeModule === "mapping" ? (
                <InputMappingSettingsPanel
                  activeGamepad={activeGamepad}
                  applyGamepadPresetToDraft={applyGamepadPresetToDraft}
                  gamepads={gamepads}
                  mappingDraft={mappingDraft}
                  recommendedGamepadPreset={recommendedGamepadPreset}
                  resetMappingSettings={resetMappingSettings}
                  saveMappingSettings={saveMappingSettings}
                  savedGamepadIsCustom={savedGamepadIsCustom}
                  selectedGamepadIndex={selectedGamepadIndex}
                  selectedGamepadPreset={selectedGamepadPreset}
                  setSelectedGamepadIndex={setSelectedGamepadIndex}
                  setSelectedGamepadPreset={setSelectedGamepadPreset}
                  t={t}
                  updateGamepadDeadzone={updateGamepadDeadzone}
                />
              ) : activeModule === "arm" ? (
                <ArmLibrary
                  addArmJoint={addArmJoint}
                  armConfig={armConfig}
                  armServoForJoint={armServoForJoint}
                  moveArmJoint={moveArmJoint}
                  removeArmJoint={removeArmJoint}
                  servos={servos}
                  setArmConfig={setArmConfig}
                  t={t}
                />
              ) : activeModule === "servo" ? (
                <ServoLibraryPanel
                  addServo={addServo}
                  addServoLinkageGroup={addServoLinkageGroup}
                  addServoToLinkageGroup={addServoToLinkageGroup}
                  expandedServoLinkageGroupIds={expandedServoLinkageGroupIds}
                  removeServo={removeServo}
                  removeServoFromLinkageGroup={removeServoFromLinkageGroup}
                  removeServoLinkageGroup={removeServoLinkageGroup}
                  selectedId={selectedId}
                  servoDraft={servoDraft}
                  servoFeedback={servoFeedback}
                  servoLibraryError={servoLibraryError}
                  servoLinkageGroups={servoLinkageGroups}
                  servos={servos}
                  setSelectedId={setSelectedId}
                  setServoDraft={setServoDraft}
                  t={t}
                  toggleServoLinkageGroupExpanded={toggleServoLinkageGroupExpanded}
                  updateServoDirection={updateServoDirection}
                  updateServoLimit={updateServoLimit}
                  updateServoLinkageGroupEnabled={updateServoLinkageGroupEnabled}
                  updateServoLinkageGroupMode={updateServoLinkageGroupMode}
                  updateServoLinkageGroupName={updateServoLinkageGroupName}
                  updateServoLinkageMemberNumber={updateServoLinkageMemberNumber}
                  updateServoLinkageMemberReverse={updateServoLinkageMemberReverse}
                  updateServoLinkageMemberWeight={updateServoLinkageMemberWeight}
                  updateServoLinkageWheelTurnLimit={updateServoLinkageWheelTurnLimit}
                  updateServoLinkageWheelTurnTarget={updateServoLinkageWheelTurnTarget}
                />
              ) : (
                <MotorLibraryPanel
                  addMotor={addMotor}
                  addMotorLinkageGroup={addMotorLinkageGroup}
                  addMotorToLinkageGroup={addMotorToLinkageGroup}
                  expandedMotorLinkageGroupIds={expandedMotorLinkageGroupIds}
                  motorDraft={motorDraft}
                  motorFeedback={motorFeedback}
                  motorLibraryError={motorLibraryError}
                  motorLinkageGroups={motorLinkageGroups}
                  motorPinSummary={motorPinSummary}
                  motors={motors}
                  removeMotor={removeMotor}
                  removeMotorFromLinkageGroup={removeMotorFromLinkageGroup}
                  removeMotorLinkageGroup={removeMotorLinkageGroup}
                  selectedChannel={selectedChannel}
                  setMotorDraft={setMotorDraft}
                  setSelectedChannel={setSelectedChannel}
                  t={t}
                  toggleMotorLinkageGroupExpanded={toggleMotorLinkageGroupExpanded}
                  updateMotorLinkageGroupEnabled={updateMotorLinkageGroupEnabled}
                  updateMotorLinkageGroupName={updateMotorLinkageGroupName}
                  updateMotorLinkageMemberReverse={updateMotorLinkageMemberReverse}
                  updateMotorLinkageMemberWeight={updateMotorLinkageMemberWeight}
                />
              )}
            </section>
  );
}
