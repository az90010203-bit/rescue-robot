import { ArrowDown, ArrowUp, ListPlus, Send, Square, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import { Metric } from "@shared/ui/AppChrome";
import { formatServoAngle, safeFramePreview, type ArmMotionTarget } from "@app/appModel";
import { ARM_MAX_JOINT_LENGTH_PX, ARM_MIN_JOINT_LENGTH_PX, type ArmConfig, type ArmJointConfig, type ArmSegmentPose } from "@adapters/persistence/storage";
import { angleDegToRaw, servoLogicalSpan, type ServoProfile } from "@adapters/hardware/protocol";

interface ArmLibraryProps {
  addArmJoint: () => void;
  armConfig: ArmConfig;
  armServoForJoint: (joint: ArmJointConfig) => ServoProfile | undefined;
  moveArmJoint: (id: string, delta: number) => void;
  removeArmJoint: (id: string) => void;
  servos: ServoProfile[];
  setArmConfig: (updater: (current: ArmConfig) => ArmConfig) => void;
  t: TFunction;
}

interface ArmCanvasProps {
  activeTargets: ArmMotionTarget[];
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  handleArmPointerDown: (event: ReactPointerEvent<SVGElement>, joint: ArmJointConfig) => void;
  handleArmPointerEnd: () => void;
  handleArmPointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  servoBusConnected: () => boolean;
  t: TFunction;
}

interface ArmJointEditorProps {
  armCanvas: ReactNode;
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  armServoForJoint: (joint: ArmJointConfig) => ServoProfile | undefined;
  kinematicsPanel: ReactNode;
  pauseArm: () => void;
  selectedArmJoint: ArmJointConfig | undefined;
  sendArmPose: () => void;
  servos: ServoProfile[];
  setArmLiveDragEnabled: (enabled: boolean) => void;
  t: TFunction;
  teachPanel: ReactNode;
  updateArmJoint: (id: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live?: boolean) => void;
  updateArmJointNumber: (id: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live?: boolean) => void;
  updateArmJointServo: (id: string, servoId: number) => void;
  calculateArmMotionTargets: (config: ArmConfig) => ArmMotionTarget[];
}

export function ArmLibrary({ addArmJoint, armConfig, armServoForJoint, moveArmJoint, removeArmJoint, servos, setArmConfig, t }: ArmLibraryProps) {
  return (
    <div className="arm-library-stack">
      <div className="action-grid">
        <button className="icon-button primary" disabled={servos.length === 0 || armConfig.joints.length >= servos.length} onClick={addArmJoint} type="button">
          <ListPlus size={18} />
          <span>{t("actions.addArmJoint")}</span>
        </button>
      </div>
      {armConfig.joints.length === 0 ? (
        <div className="empty-state">{servos.length === 0 ? t("empty.noServos") : t("empty.noArmJoints")}</div>
      ) : (
        <div className="device-list arm-joint-list">
          {armConfig.joints.map((joint, index) => {
            const servo = armServoForJoint(joint);
            return (
              <div className={armConfig.selectedJointId === joint.id ? "device-row arm-joint-row selected" : "device-row arm-joint-row"} key={joint.id}>
                <button className="device-select" onClick={() => setArmConfig((current) => ({ ...current, selectedJointId: joint.id }))} type="button">
                  <span className="device-id">ID {joint.servoId}</span>
                  <span className="device-info">
                    <span className="device-name">{joint.name}</span>
                    <span className="device-meta">
                      {servo ? `${servo.name} 路 ${formatServoAngle(joint.angleDeg)} deg 路 ${joint.lengthPx}px` : t("device.noTelemetry")}
                    </span>
                  </span>
                  <span className={joint.enabled ? "device-signal" : "device-signal muted"}>{joint.enabled ? t("fields.enabled") : t("status.standby")}</span>
                </button>
                <div className="arm-joint-actions">
                  <button className="icon-only" disabled={index === 0} onClick={() => moveArmJoint(joint.id, -1)} title={t("actions.moveUp")} type="button" aria-label={t("actions.moveUp")}>
                    <ArrowUp size={16} />
                  </button>
                  <button className="icon-only" disabled={index === armConfig.joints.length - 1} onClick={() => moveArmJoint(joint.id, 1)} title={t("actions.moveDown")} type="button" aria-label={t("actions.moveDown")}>
                    <ArrowDown size={16} />
                  </button>
                  <button className="delete-hit" onClick={() => removeArmJoint(joint.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: joint.name })}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ArmCanvas({ activeTargets, armConfig, armSegmentPoses, handleArmPointerDown, handleArmPointerEnd, handleArmPointerMove, servoBusConnected, t }: ArmCanvasProps) {
  const selectedJointId = armConfig.selectedJointId;

  return (
    <div className="arm-simulator">
      <svg className="arm-svg" viewBox="0 0 600 420" role="img" aria-label={t("aria.armSimulator")} onPointerMove={handleArmPointerMove} onPointerUp={handleArmPointerEnd} onPointerLeave={handleArmPointerEnd}>
        <defs>
          <pattern id="arm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" />
          </pattern>
        </defs>
        <rect className="arm-grid-bg" x="0" y="0" width="600" height="420" fill="url(#arm-grid)" />
        <line className="arm-axis" x1="40" y1="250" x2="560" y2="250" />
        <line className="arm-axis" x1="300" y1="56" x2="300" y2="364" />
        <circle className="arm-base" cx="300" cy="250" r="10" />
        {armSegmentPoses.map((pose) => {
          const joint = armConfig.joints.find((item) => item.id === pose.jointId);
          const selected = pose.jointId === selectedJointId;
          if (!joint) {
            return null;
          }
          return (
            <g className={selected ? "arm-segment selected" : "arm-segment"} key={pose.jointId}>
              <polyline points={pose.pathPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
              <circle className="arm-handle" cx={pose.endX} cy={pose.endY} r={selected ? 12 : 10} tabIndex={0} onPointerDown={(event) => handleArmPointerDown(event, joint)} />
              <text className="arm-label" x={pose.endX + 12} y={pose.endY - 12}>
                ID {pose.servoId} 路 {formatServoAngle(pose.angleDeg)}掳 路 {pose.lengthPx}px
              </text>
            </g>
          );
        })}
      </svg>
      <div className="arm-status-strip">
        <Metric label={t("metrics.members")} value={activeTargets.length} />
        <Metric label={t("metrics.activeMode")} value={armConfig.liveDragEnabled ? t("arm.live") : t("arm.preview")} tone={armConfig.liveDragEnabled ? "warning" : "neutral"} />
        <Metric label={t("metrics.serial")} value={servoBusConnected() ? t("status.online") : t("status.offline")} tone={servoBusConnected() ? "online" : "danger"} />
      </div>
    </div>
  );
}

export function ArmJointEditor({
  armCanvas,
  armConfig,
  armSegmentPoses,
  armServoForJoint,
  calculateArmMotionTargets,
  kinematicsPanel,
  pauseArm,
  selectedArmJoint,
  sendArmPose,
  servos,
  setArmLiveDragEnabled,
  t,
  teachPanel,
  updateArmJoint,
  updateArmJointNumber,
  updateArmJointServo
}: ArmJointEditorProps) {
  if (!selectedArmJoint) {
    return <div className="empty-state servo-command-empty">{t("empty.noArmJoints")}</div>;
  }

  const servo = armServoForJoint(selectedArmJoint);
  const logicalSpan = servo ? servoLogicalSpan(servo) : 360;
  const usedServoIds = new Set(armConfig.joints.filter((joint) => joint.id !== selectedArmJoint.id).map((joint) => joint.servoId));
  const pose = armSegmentPoses.find((item) => item.jointId === selectedArmJoint.id);
  const target = calculateArmMotionTargets({ ...armConfig, joints: [selectedArmJoint] })[0];
  const framePreview = target ? safeFramePreview(target.servoId, target.servo.name, target.physicalAngleDeg, target.speedRaw, target.acc) : "";

  return (
    <div className="arm-editor-stack">
      {armCanvas}
      <div className="command-grid arm-editor-grid">
        <label>
          <span>{t("fields.name")}</span>
          <input value={selectedArmJoint.name} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, name: event.target.value }))} />
        </label>
        <label>
          <span>{t("fields.targetServo")}</span>
          <select value={selectedArmJoint.servoId} onChange={(event) => updateArmJointServo(selectedArmJoint.id, Number(event.target.value))}>
            {servos.map((item) => (
              <option key={item.id} value={item.id} disabled={usedServoIds.has(item.id)}>
                ID {item.id} 路 {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={selectedArmJoint.enabled} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, enabled: event.target.checked }))} />
          <span>{t("fields.enabled")}</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={selectedArmJoint.reverse} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, reverse: event.target.checked }), true)} />
          <span>{t("fields.temporaryReverse")}</span>
        </label>
        <label className="angle-combo-field">
          <span>{t("fields.angleDeg")}</span>
          <div className="range-number-control">
            <input type="range" min={0} max={logicalSpan} step={1} value={selectedArmJoint.angleDeg} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "angleDeg", event.target.value, true)} />
            <input type="number" min={0} max={logicalSpan} step={1} value={formatServoAngle(selectedArmJoint.angleDeg)} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "angleDeg", event.target.value, true)} />
          </div>
        </label>
        <label>
          <span>{t("fields.neutralDeg")}</span>
          <input type="number" min={0} max={logicalSpan} step={1} value={formatServoAngle(selectedArmJoint.neutralDeg)} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "neutralDeg", event.target.value)} />
        </label>
        <label>
          <span>{t("fields.segmentLength")}</span>
          <input type="number" min={ARM_MIN_JOINT_LENGTH_PX} max={ARM_MAX_JOINT_LENGTH_PX} step={1} value={selectedArmJoint.lengthPx} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "lengthPx", event.target.value)} />
        </label>
        <label>
          <span>{t("fields.speedRaw")}</span>
          <input type="number" min={0} max={4095} step={1} value={selectedArmJoint.speedRaw} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "speedRaw", event.target.value)} />
        </label>
        <label>
          <span>{t("fields.acceleration")}</span>
          <input type="number" min={0} max={254} step={1} value={selectedArmJoint.acc} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "acc", event.target.value)} />
        </label>
      </div>
      <div className="preview-grid arm-preview-grid">
        <Metric label={t("metrics.relativeAngle")} value={pose ? formatServoAngle(pose.relativeDeg) : "--"} suffix={pose ? " deg" : ""} />
        <Metric label={t("metrics.globalAngle")} value={pose ? formatServoAngle(pose.globalDeg) : "--"} suffix={pose ? " deg" : ""} />
        <Metric label={t("metrics.rawPosition")} value={target ? angleDegToRaw(target.physicalAngleDeg) : "--"} />
        <Metric className="frame-preview" label={t("metrics.frame")} value={framePreview || "--"} code />
      </div>
      <div className="action-grid">
        <label className="checkbox-field arm-live-toggle">
          <input type="checkbox" checked={armConfig.liveDragEnabled} onChange={(event) => setArmLiveDragEnabled(event.target.checked)} />
          <span>{t("fields.liveDrag")}</span>
        </label>
        <button className="icon-button primary" onClick={sendArmPose} type="button">
          <Send size={18} />
          <span>{t("actions.sendArmPose")}</span>
        </button>
        <button className="icon-button danger" onClick={pauseArm} type="button">
          <Square size={18} />
          <span>{t("actions.pauseArm")}</span>
        </button>
      </div>
      {kinematicsPanel}
      {teachPanel}
    </div>
  );
}
