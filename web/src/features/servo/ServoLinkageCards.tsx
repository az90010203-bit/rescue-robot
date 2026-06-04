import { ChevronDown, ChevronRight, RotateCcw, RotateCw, Send, Square, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { Metric } from "../../shared/ui/AppChrome";
import {
  calculateServoLinkageTargets,
  calculateServoLinkageWheelTargets,
  type ServoLinkageGroup,
  type ServoLinkageWheelDirection
} from "../../lib/storage";
import { DEFAULT_WHEEL_SPEED_LIMIT, type ServoProfile } from "../../lib/protocol";
import { formatServoAngle, linkageWheelTurnProgressKey, type WheelTurnProgress } from "../../app/appModel";

interface ServoLinkageGroupEditorProps {
  addServoToLinkageGroup: (groupId: string, value: string) => void;
  expandedServoLinkageGroupIds: Set<string>;
  group: ServoLinkageGroup;
  removeServoFromLinkageGroup: (groupId: string, servoId: number) => void;
  removeServoLinkageGroup: (id: string) => void;
  servos: ServoProfile[];
  t: TFunction;
  toggleServoLinkageGroupExpanded: (id: string) => void;
  updateServoLinkageGroupEnabled: (id: string, enabled: boolean) => void;
  updateServoLinkageGroupMode: (id: string, mode: "position" | "wheel") => void;
  updateServoLinkageGroupName: (id: string, name: string) => void;
  updateServoLinkageMemberNumber: (groupId: string, servoId: number, field: "speedRaw" | "acc", value: string) => void;
  updateServoLinkageMemberReverse: (groupId: string, servoId: number, reverse: boolean) => void;
  updateServoLinkageMemberWeight: (groupId: string, servoId: number, value: string) => void;
  updateServoLinkageWheelTurnLimit: (id: string, enabled: boolean) => void;
  updateServoLinkageWheelTurnTarget: (id: string, field: "wheelClockwiseTurnsTarget" | "wheelCounterclockwiseTurnsTarget", value: string) => void;
}

interface ServoLinkageRunCardProps {
  formatLinkageMemberDirection: (reverse: boolean) => string;
  group: ServoLinkageGroup;
  linkageWheelDirectionByGroup: Record<string, ServoLinkageWheelDirection | "paused">;
  pauseServoLinkageGroup: (group: ServoLinkageGroup) => void;
  sendServoLinkageGroup: (group: ServoLinkageGroup) => void;
  sendServoLinkageWheelGroup: (group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) => void;
  servos: ServoProfile[];
  t: TFunction;
  updateServoLinkageMaster: (id: string, value: string, live?: boolean) => void;
  wheelTurnProgress: Record<string, WheelTurnProgress>;
}

function availableServosForLinkageGroup(group: ServoLinkageGroup, servos: ServoProfile[]) {
  return servos.filter((servo) => !group.members.some((member) => member.servoId === servo.id));
}

export function ServoLinkageGroupEditor({
  addServoToLinkageGroup,
  expandedServoLinkageGroupIds,
  group,
  removeServoFromLinkageGroup,
  removeServoLinkageGroup,
  servos,
  t,
  toggleServoLinkageGroupExpanded,
  updateServoLinkageGroupEnabled,
  updateServoLinkageGroupMode,
  updateServoLinkageGroupName,
  updateServoLinkageMemberNumber,
  updateServoLinkageMemberReverse,
  updateServoLinkageMemberWeight,
  updateServoLinkageWheelTurnLimit,
  updateServoLinkageWheelTurnTarget
}: ServoLinkageGroupEditorProps) {
  const availableServos = availableServosForLinkageGroup(group, servos);
  const isExpanded = expandedServoLinkageGroupIds.has(group.id);
  const modeLabel = group.mode === "wheel" ? t("fields.wheelMode") : t("fields.positionMode");

  return (
    <article className={`${group.enabled ? "servo-linkage-group enabled" : "servo-linkage-group"} ${isExpanded ? "expanded" : ""}`.trim()} key={group.id}>
      <div className="servo-linkage-group-header">
        <button className="linkage-summary-button" onClick={() => toggleServoLinkageGroupExpanded(group.id)} type="button" aria-expanded={isExpanded}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="linkage-summary-text">
            <strong>{group.name || t("fields.linkageName")}</strong>
            <small>
              {modeLabel} / {group.members.length} {t("metrics.members")}
            </small>
          </span>
        </button>
        <label className="checkbox-field linkage-enable">
          <input type="checkbox" checked={group.enabled} onChange={(event) => updateServoLinkageGroupEnabled(group.id, event.target.checked)} />
          <span>{t("fields.enabled")}</span>
        </label>
        <button className="delete-hit" onClick={() => removeServoLinkageGroup(group.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: group.name })}>
          <Trash2 size={16} />
        </button>
      </div>

      {isExpanded && (
        <div className="servo-linkage-group-body">
          <input className="linkage-name-input" aria-label={t("fields.linkageName")} value={group.name} onChange={(event) => updateServoLinkageGroupName(group.id, event.target.value)} />

          <div className="linkage-mode-control" role="group" aria-label={t("fields.linkageMode")}>
            <button className={group.mode === "position" ? "active" : ""} onClick={() => updateServoLinkageGroupMode(group.id, "position")} type="button">
              {t("fields.positionMode")}
            </button>
            <button className={group.mode === "wheel" ? "active" : ""} onClick={() => updateServoLinkageGroupMode(group.id, "wheel")} type="button">
              {t("fields.wheelMode")}
            </button>
          </div>

          {group.mode === "wheel" && (
            <div className="linkage-wheel-settings">
              <label className="checkbox-field">
                <input type="checkbox" checked={group.wheelTurnLimitEnabled} onChange={(event) => updateServoLinkageWheelTurnLimit(group.id, event.target.checked)} />
                <span>{t("fields.limitTurns")}</span>
              </label>
              <label>
                <span>{t("fields.clockwiseTurns")}</span>
                <input type="number" min={0.01} step={0.1} disabled={!group.wheelTurnLimitEnabled} value={group.wheelClockwiseTurnsTarget} onChange={(event) => updateServoLinkageWheelTurnTarget(group.id, "wheelClockwiseTurnsTarget", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.counterclockwiseTurns")}</span>
                <input type="number" min={0.01} step={0.1} disabled={!group.wheelTurnLimitEnabled} value={group.wheelCounterclockwiseTurnsTarget} onChange={(event) => updateServoLinkageWheelTurnTarget(group.id, "wheelCounterclockwiseTurnsTarget", event.target.value)} />
              </label>
            </div>
          )}

          <div className="servo-linkage-members">
            {group.members.length === 0 ? (
              <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
            ) : (
              group.members.map((member) => {
                const servo = servos.find((item) => item.id === member.servoId);
                if (!servo) {
                  return null;
                }

                return (
                  <div className={`linkage-member-row ${group.mode}`} key={member.servoId}>
                    <span className="device-id">ID {servo.id}</span>
                    <span className="linkage-member-name">{servo.name}</span>
                    {group.mode === "position" && (
                      <label>
                        <span>{t("fields.weightPercent")}</span>
                        <input type="number" min={0} max={100} step={1} value={member.weightPercent} onChange={(event) => updateServoLinkageMemberWeight(group.id, member.servoId, event.target.value)} />
                      </label>
                    )}
                    <label>
                      <span>{t("fields.speedRaw")}</span>
                      <input type="number" min={0} max={group.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095} step={1} value={member.speedRaw} onChange={(event) => updateServoLinkageMemberNumber(group.id, member.servoId, "speedRaw", event.target.value)} />
                    </label>
                    <label>
                      <span>{t("fields.acceleration")}</span>
                      <input type="number" min={0} max={254} step={1} value={member.acc} onChange={(event) => updateServoLinkageMemberNumber(group.id, member.servoId, "acc", event.target.value)} />
                    </label>
                    <div className="linkage-member-direction">
                      <span>{t("fields.memberDirection")}</span>
                      <div className="linkage-direction-toggle" role="group" aria-label={`${servo.name} ${t("fields.memberDirection")}`}>
                        <button className={!member.reverse ? "active" : ""} onClick={() => updateServoLinkageMemberReverse(group.id, member.servoId, false)} type="button">
                          {t("fields.forwardRotation")}
                        </button>
                        <button className={member.reverse ? "active" : ""} onClick={() => updateServoLinkageMemberReverse(group.id, member.servoId, true)} type="button">
                          {t("fields.reverseRotation")}
                        </button>
                      </div>
                    </div>
                    <button className="delete-hit" onClick={() => removeServoFromLinkageGroup(group.id, member.servoId)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: servo.name })}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {availableServos.length > 0 ? (
            <select className="linkage-add-select" value="" onChange={(event) => addServoToLinkageGroup(group.id, event.target.value)}>
              <option value="">{t("placeholders.addServoToGroup")}</option>
              {availableServos.map((servo) => (
                <option key={servo.id} value={servo.id}>
                  ID {servo.id} {servo.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="empty-state compact">{t("empty.noAvailableServos")}</div>
          )}
        </div>
      )}
    </article>
  );
}

export function ServoLinkageRunCard(props: ServoLinkageRunCardProps) {
  const { group } = props;
  if (group.mode === "wheel") {
    return <ServoLinkageWheelRunCard {...props} />;
  }

  const { formatLinkageMemberDirection, pauseServoLinkageGroup, sendServoLinkageGroup, servos, t, updateServoLinkageMaster } = props;
  const targets = calculateServoLinkageTargets(group, servos);

  return (
    <section className="servo-linkage-run-card" key={group.id} aria-label={group.name}>
      <div className="servo-linkage-run-header">
        <div>
          <span>{t("panels.servoLinkage")}</span>
          <strong>{group.name || t("fields.linkageName")}</strong>
        </div>
        <div className="linkage-run-actions">
          <button className="icon-button primary" disabled={targets.length === 0} onClick={() => sendServoLinkageGroup(group)} type="button">
            <Send size={18} />
            <span>{t("actions.sendLinkage")}</span>
          </button>
          <button className="icon-button danger" disabled={targets.length === 0} onClick={() => pauseServoLinkageGroup(group)} type="button">
            <Square size={18} />
            <span>{t("actions.pauseGroup")}</span>
          </button>
        </div>
      </div>

      <div className="linkage-master-control">
        <label>
          <span>{t("fields.masterPercent")}</span>
          <div className="range-number-control">
            <input className="angle-range" aria-label={`${group.name} ${t("fields.masterPercent")}`} type="range" min={0} max={100} step={1} value={group.masterPercent} onChange={(event) => updateServoLinkageMaster(group.id, event.target.value, true)} />
            <input className="angle-number" aria-label={`${group.name} ${t("fields.masterPercent")}`} type="number" min={0} max={100} step={1} value={group.masterPercent} onChange={(event) => updateServoLinkageMaster(group.id, event.target.value, true)} />
          </div>
        </label>
      </div>

      <div className="linkage-target-preview">
        {targets.length === 0 ? (
          <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
        ) : (
          targets.map((target) => (
            <span key={target.servoId}>
              <strong>
                ID {target.servoId} {target.name}
              </strong>
              <code>
                {formatServoAngle(target.logicalAngleDeg)} deg / {formatServoAngle(target.physicalAngleDeg)} phys
              </code>
              <code>
                {target.speedRaw} raw / acc {target.acc} / {formatLinkageMemberDirection(target.reverse)}
              </code>
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function ServoLinkageWheelRunCard({
  formatLinkageMemberDirection,
  group,
  linkageWheelDirectionByGroup,
  pauseServoLinkageGroup,
  sendServoLinkageWheelGroup,
  servos,
  t,
  wheelTurnProgress
}: ServoLinkageRunCardProps) {
  const clockwiseTargets = calculateServoLinkageWheelTargets(group, servos, "clockwise");
  const counterclockwiseTargets = calculateServoLinkageWheelTargets(group, servos, "counterclockwise");
  const activeDirection = linkageWheelDirectionByGroup[group.id] ?? "paused";
  const previewTargets = activeDirection === "counterclockwise" ? counterclockwiseTargets : clockwiseTargets;
  const hasTargets = clockwiseTargets.length > 0;

  return (
    <section className="servo-linkage-run-card wheel" key={group.id} aria-label={group.name}>
      <div className="servo-linkage-run-header">
        <div>
          <span>{t("panels.servoLinkage")}</span>
          <strong>{group.name || t("fields.linkageName")}</strong>
        </div>
        <div className="linkage-run-actions three-buttons">
          <button className="icon-button primary" disabled={!hasTargets} onClick={() => sendServoLinkageWheelGroup(group, "clockwise")} type="button">
            <RotateCw size={18} />
            <span>{t("actions.clockwise")}</span>
          </button>
          <button className="icon-button primary" disabled={!hasTargets} onClick={() => sendServoLinkageWheelGroup(group, "counterclockwise")} type="button">
            <RotateCcw size={18} />
            <span>{t("actions.counterclockwise")}</span>
          </button>
          <button className="icon-button danger" disabled={!hasTargets} onClick={() => pauseServoLinkageGroup(group)} type="button">
            <Square size={18} />
            <span>{t("actions.pause")}</span>
          </button>
        </div>
      </div>

      <div className="linkage-wheel-run-status">
        <Metric label={t("metrics.mode")} value={t("fields.wheelMode")} />
        <Metric label={t("metrics.activeDirection")} value={activeDirection === "clockwise" ? t("actions.clockwise") : activeDirection === "counterclockwise" ? t("actions.counterclockwise") : t("actions.pause")} tone={activeDirection === "paused" ? "neutral" : "warning"} />
        <Metric label={t("fields.clockwiseTurns")} value={group.wheelTurnLimitEnabled ? group.wheelClockwiseTurnsTarget : "--"} />
        <Metric label={t("fields.counterclockwiseTurns")} value={group.wheelTurnLimitEnabled ? group.wheelCounterclockwiseTurnsTarget : "--"} />
      </div>

      <div className="linkage-target-preview">
        {previewTargets.length === 0 ? (
          <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
        ) : (
          previewTargets.map((target) => {
            const progress = wheelTurnProgress[linkageWheelTurnProgressKey(group.id, target.servoId)];
            return (
              <span key={target.servoId}>
                <strong>
                  ID {target.servoId} {target.name}
                </strong>
                <code>
                  {target.effectiveSpeedRaw} raw / acc {target.acc} / {formatLinkageMemberDirection(target.reverse)}
                </code>
                <code>
                  {t("metrics.turnProgress")}: {progress ? `${progress.completedTurns.toFixed(2)} / ${progress.targetTurns}` : "--"}
                </code>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}
