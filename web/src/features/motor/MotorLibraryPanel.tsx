import { ListPlus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { MotorFeedbackMap } from "../../app/appModel";
import type { MotorProfile } from "../../lib/protocol";
import type { MotorLinkageGroup, ValidationErrorKey } from "../../lib/storage";
import { MotorLinkageGroupEditor } from "./MotorLinkageCards";

interface MotorLibraryPanelProps {
  addMotor: (event: FormEvent<HTMLFormElement>) => void;
  addMotorLinkageGroup: () => void;
  addMotorToLinkageGroup: (groupId: string, channel: string) => void;
  expandedMotorLinkageGroupIds: Set<string>;
  motorDraft: { channel: string; name: string };
  motorFeedback: MotorFeedbackMap;
  motorLibraryError: ValidationErrorKey | null;
  motorLinkageGroups: MotorLinkageGroup[];
  motorPinSummary: (motor: MotorProfile) => string;
  motors: MotorProfile[];
  removeMotor: (channel: string) => void;
  removeMotorFromLinkageGroup: (groupId: string, channel: string) => void;
  removeMotorLinkageGroup: (groupId: string) => void;
  selectedChannel: string;
  setMotorDraft: Dispatch<SetStateAction<{ channel: string; name: string }>>;
  setSelectedChannel: (channel: string) => void;
  t: TFunction;
  toggleMotorLinkageGroupExpanded: (groupId: string) => void;
  updateMotorLinkageGroupEnabled: (groupId: string, enabled: boolean) => void;
  updateMotorLinkageGroupName: (groupId: string, name: string) => void;
  updateMotorLinkageMemberReverse: (groupId: string, channel: string, reverse: boolean) => void;
  updateMotorLinkageMemberWeight: (groupId: string, channel: string, value: string) => void;
}

export function MotorLibraryPanel({
  addMotor,
  addMotorLinkageGroup,
  addMotorToLinkageGroup,
  expandedMotorLinkageGroupIds,
  motorDraft,
  motorFeedback,
  motorLibraryError,
  motorLinkageGroups,
  motorPinSummary,
  motors,
  removeMotor,
  removeMotorFromLinkageGroup,
  removeMotorLinkageGroup,
  selectedChannel,
  setMotorDraft,
  setSelectedChannel,
  t,
  toggleMotorLinkageGroupExpanded,
  updateMotorLinkageGroupEnabled,
  updateMotorLinkageGroupName,
  updateMotorLinkageMemberReverse,
  updateMotorLinkageMemberWeight
}: MotorLibraryPanelProps) {
  return (
    <>
      <form className="entity-form" onSubmit={addMotor}>
        <label>
          <span>{t("fields.channel")}</span>
          <input value={motorDraft.channel} onChange={(event) => setMotorDraft((current) => ({ ...current, channel: event.target.value }))} />
        </label>
        <label>
          <span>{t("fields.name")}</span>
          <input value={motorDraft.name} onChange={(event) => setMotorDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <button className="icon-only" title={t("actions.addMotor")} type="submit" aria-label={t("actions.addMotor")}>
          <Save size={18} />
        </button>
      </form>
      {motorLibraryError && <p className="form-error">{t(motorLibraryError)}</p>}

      <div className="device-list">
        {motors.length === 0 ? (
          <div className="empty-state">{t("empty.noMotors")}</div>
        ) : (
          motors.map((motor) => (
            <div className={selectedChannel === motor.channel ? "device-row selected" : "device-row"} key={motor.channel}>
              <button className="device-select" onClick={() => setSelectedChannel(motor.channel)} type="button">
                <span className="device-id">{motor.channel}</span>
                <span className="device-info">
                  <span className="device-name">{motor.name}</span>
                  <span className="device-meta">
                    {motorPinSummary(motor) ||
                      (motorFeedback[motor.channel]?.commandedSpeedPercent !== undefined
                        ? t("device.commandTelemetry", { value: motorFeedback[motor.channel].commandedSpeedPercent })
                        : t("device.noPinMapping"))}
                  </span>
                </span>
                <span className={motorFeedback[motor.channel] ? "device-signal" : "device-signal muted"}>
                  {motorFeedback[motor.channel] ? t("device.data") : t("device.idle")}
                </span>
              </button>
              <button
                className="delete-hit"
                onClick={() => removeMotor(motor.channel)}
                title={t("common.delete")}
                type="button"
                aria-label={t("device.deleteNamed", { name: motor.name })}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="servo-linkage-config">
        <div className="servo-linkage-config-header">
          <div className="drive-section-title">
            <SlidersHorizontal size={17} />
            <h3>{t("panels.motorLinkage")}</h3>
          </div>
          <button className="icon-only" title={t("actions.addMotorLinkageGroup")} type="button" aria-label={t("actions.addMotorLinkageGroup")} onClick={addMotorLinkageGroup}>
            <ListPlus size={18} />
          </button>
        </div>
        {motorLinkageGroups.length === 0 ? (
          <div className="empty-state">{t("empty.noMotorLinkageGroups")}</div>
        ) : (
          <div className="servo-linkage-group-list">
            {motorLinkageGroups.map((group) => (
              <MotorLinkageGroupEditor
                addMotorToLinkageGroup={addMotorToLinkageGroup}
                expandedMotorLinkageGroupIds={expandedMotorLinkageGroupIds}
                group={group}
                key={group.id}
                motors={motors}
                removeMotorFromLinkageGroup={removeMotorFromLinkageGroup}
                removeMotorLinkageGroup={removeMotorLinkageGroup}
                t={t}
                toggleMotorLinkageGroupExpanded={toggleMotorLinkageGroupExpanded}
                updateMotorLinkageGroupEnabled={updateMotorLinkageGroupEnabled}
                updateMotorLinkageGroupName={updateMotorLinkageGroupName}
                updateMotorLinkageMemberReverse={updateMotorLinkageMemberReverse}
                updateMotorLinkageMemberWeight={updateMotorLinkageMemberWeight}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
