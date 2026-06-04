import { ListPlus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { normalizeServoProfile, type ServoProfile } from "../../lib/protocol";
import type { ServoLinkageGroup } from "../../lib/storage";
import type { ValidationErrorKey } from "../../lib/storage";
import type { ServoFeedbackMap } from "../../app/appModel";
import { ServoLinkageGroupEditor } from "./ServoLinkageCards";

interface ServoLibraryPanelProps {
  addServo: (event: FormEvent<HTMLFormElement>) => void;
  addServoLinkageGroup: () => void;
  addServoToLinkageGroup: (groupId: string, value: string) => void;
  expandedServoLinkageGroupIds: Set<string>;
  removeServo: (id: number) => void;
  removeServoFromLinkageGroup: (groupId: string, servoId: number) => void;
  removeServoLinkageGroup: (id: string) => void;
  selectedId: number | "";
  servoDraft: { id: string; name: string };
  servoFeedback: ServoFeedbackMap;
  servoLibraryError: ValidationErrorKey | null;
  servoLinkageGroups: ServoLinkageGroup[];
  servos: ServoProfile[];
  setSelectedId: (id: number | "") => void;
  setServoDraft: Dispatch<SetStateAction<{ id: string; name: string }>>;
  t: TFunction;
  toggleServoLinkageGroupExpanded: (id: string) => void;
  updateServoDirection: (id: number, reversed: boolean) => void;
  updateServoLimit: (id: number, field: "minDeg" | "maxDeg", value: string) => void;
  updateServoLinkageGroupEnabled: (id: string, enabled: boolean) => void;
  updateServoLinkageGroupMode: (id: string, mode: "position" | "wheel") => void;
  updateServoLinkageGroupName: (id: string, name: string) => void;
  updateServoLinkageMemberNumber: (groupId: string, servoId: number, field: "speedRaw" | "acc", value: string) => void;
  updateServoLinkageMemberReverse: (groupId: string, servoId: number, reverse: boolean) => void;
  updateServoLinkageMemberWeight: (groupId: string, servoId: number, value: string) => void;
  updateServoLinkageWheelTurnLimit: (id: string, enabled: boolean) => void;
  updateServoLinkageWheelTurnTarget: (id: string, field: "wheelClockwiseTurnsTarget" | "wheelCounterclockwiseTurnsTarget", value: string) => void;
}

export function ServoLibraryPanel({
  addServo,
  addServoLinkageGroup,
  addServoToLinkageGroup,
  expandedServoLinkageGroupIds,
  removeServo,
  removeServoFromLinkageGroup,
  removeServoLinkageGroup,
  selectedId,
  servoDraft,
  servoFeedback,
  servoLibraryError,
  servoLinkageGroups,
  servos,
  setSelectedId,
  setServoDraft,
  t,
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
  updateServoLinkageWheelTurnTarget
}: ServoLibraryPanelProps) {
  return (
    <>
      <form className="entity-form" onSubmit={addServo}>
        <label>
          <span>ID</span>
          <input
            inputMode="numeric"
            min={0}
            max={253}
            type="number"
            value={servoDraft.id}
            onChange={(event) => setServoDraft((current) => ({ ...current, id: event.target.value }))}
          />
        </label>
        <label>
          <span>{t("fields.name")}</span>
          <input value={servoDraft.name} onChange={(event) => setServoDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <button className="icon-only" title={t("actions.addServo")} type="submit" aria-label={t("actions.addServo")}>
          <Save size={18} />
        </button>
      </form>
      {servoLibraryError && <p className="form-error">{t(servoLibraryError)}</p>}

      <div className="device-list">
        {servos.length === 0 ? (
          <div className="empty-state">{t("empty.noServos")}</div>
        ) : (
          servos.map((servo) => {
            const normalizedServo = normalizeServoProfile(servo);
            return (
              <div className={selectedId === servo.id ? "device-row servo-device-row selected" : "device-row servo-device-row"} key={servo.id}>
                <button className="device-select" onClick={() => setSelectedId(servo.id)} type="button">
                  <span className="device-id">ID {servo.id}</span>
                  <span className="device-info">
                    <span className="device-name">{servo.name}</span>
                    <span className="device-meta">
                      {servoFeedback[servo.id]?.positionRaw !== undefined
                        ? t("device.positionTelemetry", { value: servoFeedback[servo.id].positionRaw })
                        : t("device.noTelemetry")}
                    </span>
                  </span>
                  <span className={servoFeedback[servo.id] ? "device-signal" : "device-signal muted"}>
                    {servoFeedback[servo.id] ? t("device.data") : t("device.idle")}
                  </span>
                </button>
                <button
                  className="delete-hit"
                  onClick={() => removeServo(servo.id)}
                  title={t("common.delete")}
                  type="button"
                  aria-label={t("device.deleteNamed", { name: servo.name })}
                >
                  <Trash2 size={16} />
                </button>
                <div className="servo-limit-grid">
                  <label>
                    <span>最小角</span>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      step={1}
                      value={normalizedServo.minDeg}
                      onChange={(event) => updateServoLimit(servo.id, "minDeg", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>最大角</span>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      step={1}
                      value={normalizedServo.maxDeg}
                      onChange={(event) => updateServoLimit(servo.id, "maxDeg", event.target.value)}
                    />
                  </label>
                  <label className="checkbox-field servo-reverse-field">
                    <input
                      type="checkbox"
                      checked={normalizedServo.direction === -1}
                      onChange={(event) => updateServoDirection(servo.id, event.target.checked)}
                    />
                    <span>反转</span>
                  </label>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="servo-linkage-config">
        <div className="servo-linkage-config-header">
          <div className="drive-section-title">
            <SlidersHorizontal size={17} />
            <h3>{t("panels.servoLinkage")}</h3>
          </div>
          <button className="icon-only" title={t("actions.addLinkageGroup")} type="button" aria-label={t("actions.addLinkageGroup")} onClick={addServoLinkageGroup}>
            <ListPlus size={18} />
          </button>
        </div>
        {servoLinkageGroups.length === 0 ? (
          <div className="empty-state">{t("empty.noLinkageGroups")}</div>
        ) : (
          <div className="servo-linkage-group-list">
            {servoLinkageGroups.map((group) => (
              <ServoLinkageGroupEditor
                addServoToLinkageGroup={addServoToLinkageGroup}
                expandedServoLinkageGroupIds={expandedServoLinkageGroupIds}
                group={group}
                key={group.id}
                removeServoFromLinkageGroup={removeServoFromLinkageGroup}
                removeServoLinkageGroup={removeServoLinkageGroup}
                servos={servos}
                t={t}
                toggleServoLinkageGroupExpanded={toggleServoLinkageGroupExpanded}
                updateServoLinkageGroupEnabled={updateServoLinkageGroupEnabled}
                updateServoLinkageGroupMode={updateServoLinkageGroupMode}
                updateServoLinkageGroupName={updateServoLinkageGroupName}
                updateServoLinkageMemberNumber={updateServoLinkageMemberNumber}
                updateServoLinkageMemberReverse={updateServoLinkageMemberReverse}
                updateServoLinkageMemberWeight={updateServoLinkageMemberWeight}
                updateServoLinkageWheelTurnLimit={updateServoLinkageWheelTurnLimit}
                updateServoLinkageWheelTurnTarget={updateServoLinkageWheelTurnTarget}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
