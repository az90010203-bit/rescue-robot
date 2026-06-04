import { ChevronDown, ChevronRight, Send, Square, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import type { MotorFeedbackMap } from "../../app/appModel";
import { formatSignedPercent } from "../../app/appModel";
import type { MotorProfile } from "../../lib/protocol";
import type { MotorLinkageGroup } from "../../lib/storage";
import { calculateMotorLinkageTargets } from "../../lib/storage";

interface MotorLinkageGroupEditorProps {
  addMotorToLinkageGroup: (groupId: string, channel: string) => void;
  expandedMotorLinkageGroupIds: Set<string>;
  group: MotorLinkageGroup;
  motors: MotorProfile[];
  removeMotorFromLinkageGroup: (groupId: string, channel: string) => void;
  removeMotorLinkageGroup: (groupId: string) => void;
  t: TFunction;
  toggleMotorLinkageGroupExpanded: (groupId: string) => void;
  updateMotorLinkageGroupEnabled: (groupId: string, enabled: boolean) => void;
  updateMotorLinkageGroupName: (groupId: string, name: string) => void;
  updateMotorLinkageMemberReverse: (groupId: string, channel: string, reverse: boolean) => void;
  updateMotorLinkageMemberWeight: (groupId: string, channel: string, value: string) => void;
}

interface MotorLinkageRunCardProps {
  formatDirectionLabel: (direction: string) => string;
  formatLinkageMemberDirection: (reverse: boolean) => string;
  group: MotorLinkageGroup;
  motorFeedback: MotorFeedbackMap;
  motors: MotorProfile[];
  sendMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  stopMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  t: TFunction;
  updateMotorLinkageMaster: (groupId: string, value: string, live?: boolean) => void;
}

export function MotorLinkageGroupEditor({
  addMotorToLinkageGroup,
  expandedMotorLinkageGroupIds,
  group,
  motors,
  removeMotorFromLinkageGroup,
  removeMotorLinkageGroup,
  t,
  toggleMotorLinkageGroupExpanded,
  updateMotorLinkageGroupEnabled,
  updateMotorLinkageGroupName,
  updateMotorLinkageMemberReverse,
  updateMotorLinkageMemberWeight
}: MotorLinkageGroupEditorProps) {
  const isExpanded = expandedMotorLinkageGroupIds.has(group.id);
  const availableMotors = motors.filter((motor) => !group.members.some((member) => member.channel === motor.channel));

  return (
    <article className={`${group.enabled ? "servo-linkage-group enabled" : "servo-linkage-group"} ${isExpanded ? "expanded" : ""}`.trim()} key={group.id}>
      <div className="servo-linkage-group-header">
        <button className="linkage-summary-button" onClick={() => toggleMotorLinkageGroupExpanded(group.id)} type="button" aria-expanded={isExpanded}>
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span className="linkage-summary-text">
            <strong>{group.name || t("fields.linkageName")}</strong>
            <small>
              {group.members.length} {t("metrics.members")} / {group.masterSpeedPercent}%
            </small>
          </span>
        </button>
        <label className="checkbox-field linkage-enable">
          <input type="checkbox" checked={group.enabled} onChange={(event) => updateMotorLinkageGroupEnabled(group.id, event.target.checked)} />
          <span>{t("fields.enabled")}</span>
        </label>
        <button className="delete-hit" onClick={() => removeMotorLinkageGroup(group.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: group.name })}>
          <Trash2 size={16} />
        </button>
      </div>

      {isExpanded && (
        <div className="servo-linkage-group-body">
          <input className="linkage-name-input" aria-label={t("fields.linkageName")} value={group.name} onChange={(event) => updateMotorLinkageGroupName(group.id, event.target.value)} />

          <div className="servo-linkage-members">
            {group.members.length === 0 ? (
              <div className="empty-state compact">{t("empty.noMotorLinkageMembers")}</div>
            ) : (
              group.members.map((member) => {
                const motor = motors.find((item) => item.channel === member.channel);
                if (!motor) {
                  return null;
                }

                return (
                  <div className="linkage-member-row position" key={member.channel}>
                    <span className="device-id">{motor.channel}</span>
                    <span className="linkage-member-name">{motor.name}</span>
                    <label>
                      <span>{t("fields.weightPercent")}</span>
                      <input type="number" min={0} max={100} step={1} value={member.weightPercent} onChange={(event) => updateMotorLinkageMemberWeight(group.id, member.channel, event.target.value)} />
                    </label>
                    <div className="linkage-member-direction">
                      <span>{t("fields.memberDirection")}</span>
                      <div className="linkage-direction-toggle" role="group" aria-label={`${motor.name} ${t("fields.memberDirection")}`}>
                        <button className={!member.reverse ? "active" : ""} onClick={() => updateMotorLinkageMemberReverse(group.id, member.channel, false)} type="button">
                          {t("fields.forwardRotation")}
                        </button>
                        <button className={member.reverse ? "active" : ""} onClick={() => updateMotorLinkageMemberReverse(group.id, member.channel, true)} type="button">
                          {t("fields.reverseRotation")}
                        </button>
                      </div>
                    </div>
                    <button className="delete-hit" onClick={() => removeMotorFromLinkageGroup(group.id, member.channel)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: motor.name })}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {availableMotors.length > 0 ? (
            <select className="linkage-add-select" value="" onChange={(event) => addMotorToLinkageGroup(group.id, event.target.value)}>
              <option value="">{t("placeholders.addMotorToGroup")}</option>
              {availableMotors.map((motor) => (
                <option key={motor.channel} value={motor.channel}>
                  {motor.channel} {motor.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="empty-state compact">{t("empty.noAvailableMotors")}</div>
          )}
        </div>
      )}
    </article>
  );
}

export function MotorLinkageRunCard({
  formatDirectionLabel,
  formatLinkageMemberDirection,
  group,
  motorFeedback,
  motors,
  sendMotorLinkageGroup,
  stopMotorLinkageGroup,
  t,
  updateMotorLinkageMaster
}: MotorLinkageRunCardProps) {
  const targets = calculateMotorLinkageTargets(group, motors);

  return (
    <section className="servo-linkage-run-card" key={group.id} aria-label={group.name}>
      <div className="servo-linkage-run-header">
        <div>
          <span>{t("panels.motorLinkage")}</span>
          <strong>{group.name || t("fields.linkageName")}</strong>
        </div>
        <div className="linkage-run-actions">
          <button className="icon-button primary" disabled={targets.length === 0} onClick={() => sendMotorLinkageGroup(group)} type="button">
            <Send size={18} />
            <span>{t("actions.sendMotorLinkage")}</span>
          </button>
          <button className="icon-button danger" disabled={targets.length === 0} onClick={() => stopMotorLinkageGroup(group)} type="button">
            <Square size={18} />
            <span>{t("actions.stopGroup")}</span>
          </button>
        </div>
      </div>

      <div className="linkage-master-control">
        <label>
          <span>{t("fields.masterSpeedPercent")}</span>
          <div className="range-number-control">
            <input className="angle-range" aria-label={`${group.name} ${t("fields.masterSpeedPercent")}`} type="range" min={-100} max={100} step={1} value={group.masterSpeedPercent} onChange={(event) => updateMotorLinkageMaster(group.id, event.target.value, true)} />
            <input className="angle-number" aria-label={`${group.name} ${t("fields.masterSpeedPercent")}`} type="number" min={-100} max={100} step={1} value={group.masterSpeedPercent} onChange={(event) => updateMotorLinkageMaster(group.id, event.target.value, true)} />
          </div>
        </label>
      </div>

      <div className="linkage-target-preview">
        {targets.length === 0 ? (
          <div className="empty-state compact">{t("empty.noMotorLinkageMembers")}</div>
        ) : (
          targets.map((target) => (
            <span key={target.channel}>
              <strong>
                {target.channel} {target.name}
              </strong>
              <code>
                {formatSignedPercent(target.speedPercent)} / {target.weightPercent}% / {formatLinkageMemberDirection(target.reverse)}
              </code>
              <code>
                {t("metrics.direction")}: {formatDirectionLabel(motorFeedback[target.channel]?.direction ?? "stopped")}
              </code>
            </span>
          ))
        )}
      </div>
    </section>
  );
}
