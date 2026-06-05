import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { ServoSafetyPreset } from "../../lib/servoSafety";
import type { ServoSmoothPreset } from "../../lib/servoMotion";
import type { ServoLinkageGroup, ServoLinkageWheelDirection } from "../../lib/storage";
import type { ServoProfile } from "../../lib/protocol";
import type { WheelSliderDirection } from "../../lib/servoWheelSlider";
import {
  type ServoCommandState,
  type ServoCommandStateMap,
  type ServoControlMode,
  type ServoFeedbackMap,
  type ServoMotionStatusMap,
  type ServoSafetyDisplayStatus,
  type ServoSafetyStatusMap,
  type WheelTurnProgress
} from "../../app/appModel";
import { ServoCommandCard } from "./ServoCommandCard";
import { ServoLinkageRunCard } from "./ServoLinkageCards";

interface ServoCommandPanelProps {
  cancelServoMotion: () => void;
  currentServoSafetyConfig: {
    currentLimitRaw: number;
    loadLimitRaw: number;
    pollMs: number;
    temperatureLimitC: number;
  };
  currentServoSmoothConfig: {
    positionDegPerSec: number;
    tickMs: number;
    wheelRawPerSec: number;
  };
  enabledServoLinkageGroups: ServoLinkageGroup[];
  formatLinkageMemberDirection: (reverse: boolean) => string;
  formatWheelSliderDirectionLabel: (direction: WheelSliderDirection) => string;
  handleAngleSliderChange: (servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) => void;
  handleLiveDragToggle: (id: number, enabled: boolean) => void;
  handleServoModeChange: (id: number, mode: ServoControlMode) => void;
  handleWheelSliderChange: (servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) => void;
  linkageWheelDirectionByGroup: Record<string, ServoLinkageWheelDirection | "paused">;
  pauseServo: (servo: ServoProfile, state: ServoCommandState) => void;
  pauseServoLinkageGroup: (group: ServoLinkageGroup) => void;
  pingServo: (servo: ServoProfile) => void;
  readServo: (servo: ServoProfile) => void;
  selectedId: number | "";
  sendMoveForServo: (servo: ServoProfile, state: ServoCommandState) => void;
  sendServoLinkageGroup: (group: ServoLinkageGroup) => void;
  sendServoLinkageWheelGroup: (group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) => void;
  servoCommandById: ServoCommandStateMap;
  servoFeedback: ServoFeedbackMap;
  servoMotionStatusById: ServoMotionStatusMap;
  servoSafetyEnabled: boolean;
  servoSafetyPreset: ServoSafetyPreset;
  servoSafetyStatusById: ServoSafetyStatusMap;
  servoSafetyStatusLabel: (status?: ServoSafetyDisplayStatus) => string;
  servoSafetyStatusTone: (status?: ServoSafetyDisplayStatus) => "neutral" | "online" | "warning" | "danger";
  servoSmoothPreset: ServoSmoothPreset;
  servoSmoothingEnabled: boolean;
  servos: ServoProfile[];
  setSelectedId: (id: number | "") => void;
  setServoSafetyEnabled: Dispatch<SetStateAction<boolean>>;
  setServoSafetyPreset: Dispatch<SetStateAction<ServoSafetyPreset>>;
  setServoSmoothPreset: Dispatch<SetStateAction<ServoSmoothPreset>>;
  setServoSmoothingEnabled: Dispatch<SetStateAction<boolean>>;
  setTorqueForServo: (servo: ServoProfile, enabled: boolean) => void;
  t: TFunction;
  updateServoCommandField: <K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) => void;
  updateServoLinkageMaster: (id: string, value: string, live?: boolean) => void;
  updateServoLogicalAngle: (servo: ServoProfile, value: string) => void;
  updateServoWheelMaxSpeed: (servo: ServoProfile, state: ServoCommandState, value: string) => void;
  updateServoWheelSlider: (servo: ServoProfile, state: ServoCommandState, value: string) => void;
  wheelTurnProgress: Record<string, WheelTurnProgress>;
}

export function ServoCommandPanel({
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
  selectedId,
  sendMoveForServo,
  sendServoLinkageGroup,
  sendServoLinkageWheelGroup,
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
  setSelectedId,
  setServoSafetyEnabled,
  setServoSafetyPreset,
  setServoSmoothPreset,
  setServoSmoothingEnabled,
  setTorqueForServo,
  t,
  updateServoCommandField,
  updateServoLinkageMaster,
  updateServoLogicalAngle,
  updateServoWheelMaxSpeed,
  updateServoWheelSlider,
  wheelTurnProgress
}: ServoCommandPanelProps) {
  return (
    <>
      <div className="servo-smoothing-panel">
        <label className="checkbox-field servo-smoothing-toggle">
          <input
            type="checkbox"
            checked={servoSmoothingEnabled}
            onChange={(event) => {
              setServoSmoothingEnabled(event.target.checked);
              if (!event.target.checked) {
                cancelServoMotion();
              }
            }}
          />
          <span>平滑控制</span>
        </label>
        <label>
          <span>平滑档位</span>
          <select value={servoSmoothPreset} disabled={!servoSmoothingEnabled} onChange={(event) => setServoSmoothPreset(event.target.value as ServoSmoothPreset)}>
            <option value="soft">柔和</option>
            <option value="standard">标准</option>
            <option value="fast">快速</option>
          </select>
        </label>
        <div className="servo-smoothing-meta">
          {servoSmoothingEnabled
            ? `${currentServoSmoothConfig.tickMs}ms tick / ${currentServoSmoothConfig.positionDegPerSec} deg/s / ${currentServoSmoothConfig.wheelRawPerSec} raw/s`
            : "直发模式"}
        </div>
        <label className="checkbox-field servo-smoothing-toggle">
          <input type="checkbox" checked={servoSafetyEnabled} onChange={(event) => setServoSafetyEnabled(event.target.checked)} />
          <span>{t("fields.feedbackProtection")}</span>
        </label>
        <label>
          <span>{t("fields.safetyPreset")}</span>
          <select value={servoSafetyPreset} disabled={!servoSafetyEnabled} onChange={(event) => setServoSafetyPreset(event.target.value as ServoSafetyPreset)}>
            <option value="relaxed">{t("fields.safetyRelaxed")}</option>
            <option value="standard">{t("fields.safetyStandard")}</option>
            <option value="sensitive">{t("fields.safetySensitive")}</option>
          </select>
        </label>
        <div className="servo-smoothing-meta">
          {servoSafetyEnabled
            ? `${currentServoSafetyConfig.pollMs}ms poll / load ${currentServoSafetyConfig.loadLimitRaw} / current ${currentServoSafetyConfig.currentLimitRaw} / ${currentServoSafetyConfig.temperatureLimitC}°C`
            : t("safety.disabled")}
        </div>
      </div>
      {servos.length === 0 ? (
        <div className="empty-state servo-command-empty">{t("empty.noServos")}</div>
      ) : (
        <>
          {enabledServoLinkageGroups.length > 0 && (
            <div className="servo-linkage-run-list">
              {enabledServoLinkageGroups.map((group) => (
                <ServoLinkageRunCard
                  formatLinkageMemberDirection={formatLinkageMemberDirection}
                  group={group}
                  key={group.id}
                  linkageWheelDirectionByGroup={linkageWheelDirectionByGroup}
                  pauseServoLinkageGroup={pauseServoLinkageGroup}
                  sendServoLinkageGroup={sendServoLinkageGroup}
                  sendServoLinkageWheelGroup={sendServoLinkageWheelGroup}
                  servos={servos}
                  t={t}
                  updateServoLinkageMaster={updateServoLinkageMaster}
                  wheelTurnProgress={wheelTurnProgress}
                />
              ))}
            </div>
          )}
          <div className="servo-command-list">
            {servos.map((servo) => (
              <ServoCommandCard
                formatWheelSliderDirectionLabel={formatWheelSliderDirectionLabel}
                handleAngleSliderChange={handleAngleSliderChange}
                handleLiveDragToggle={handleLiveDragToggle}
                handleServoModeChange={handleServoModeChange}
                handleWheelSliderChange={handleWheelSliderChange}
                key={servo.id}
                pauseServo={pauseServo}
                pingServo={pingServo}
                readServo={readServo}
                selectedId={selectedId}
                sendMoveForServo={sendMoveForServo}
                servo={servo}
                servoCommandById={servoCommandById}
                servoFeedback={servoFeedback}
                servoMotionStatusById={servoMotionStatusById}
                servoSafetyStatusById={servoSafetyStatusById}
                servoSafetyStatusLabel={servoSafetyStatusLabel}
                servoSafetyStatusTone={servoSafetyStatusTone}
                setSelectedId={setSelectedId}
                setTorqueForServo={setTorqueForServo}
                t={t}
                updateServoCommandField={updateServoCommandField}
                updateServoLogicalAngle={updateServoLogicalAngle}
                updateServoWheelMaxSpeed={updateServoWheelMaxSpeed}
                updateServoWheelSlider={updateServoWheelSlider}
                wheelTurnProgress={wheelTurnProgress}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
