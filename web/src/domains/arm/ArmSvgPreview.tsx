import type { TFunction } from "i18next";
import { useId } from "react";
import { Metric } from "@shared/ui/AppChrome";
import { formatServoAngle } from "@app/appModel";
import type { ArmConfig, ArmSegmentPose } from "@adapters/persistence/storage";

interface ArmSvgPreviewProps {
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  serialOnline: boolean;
  t: TFunction;
  title?: string;
}

export function ArmSvgPreview({ armConfig, armSegmentPoses, serialOnline, t, title }: ArmSvgPreviewProps) {
  const selectedJointId = armConfig.selectedJointId;
  const enabledJointCount = armConfig.joints.filter((joint) => joint.enabled).length;
  const patternId = `arm-preview-grid-${useId().replace(/:/g, "")}`;

  return (
    <div className="arm-simulator arm-svg-preview">
      <svg className="arm-svg" viewBox="0 0 600 420" role="img" aria-label={title ?? t("aria.armSimulator")}>
        <defs>
          <pattern id={patternId} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" />
          </pattern>
        </defs>
        <rect className="arm-grid-bg" x="0" y="0" width="600" height="420" fill={`url(#${patternId})`} />
        <line className="arm-axis" x1="40" y1="250" x2="560" y2="250" />
        <line className="arm-axis" x1="300" y1="56" x2="300" y2="364" />
        <circle className="arm-base" cx="300" cy="250" r="10" />
        {armSegmentPoses.map((pose) => {
          const selected = pose.jointId === selectedJointId;
          return (
            <g className={selected ? "arm-segment selected" : "arm-segment"} key={pose.jointId}>
              <polyline points={pose.pathPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
              <circle className="arm-handle" cx={pose.endX} cy={pose.endY} r={selected ? 12 : 10} />
              <text className="arm-label" x={pose.endX + 12} y={pose.endY - 12}>
                ID {pose.servoId} / {formatServoAngle(pose.angleDeg)} deg / {pose.lengthPx}px
              </text>
            </g>
          );
        })}
      </svg>
      <div className="arm-status-strip">
        <Metric label={t("metrics.members")} value={enabledJointCount} />
        <Metric label={t("metrics.activeMode")} value={armConfig.liveDragEnabled ? t("arm.live") : t("arm.preview")} tone={armConfig.liveDragEnabled ? "warning" : "neutral"} />
        <Metric label={t("metrics.serial")} value={serialOnline ? t("status.online") : t("status.offline")} tone={serialOnline ? "online" : "danger"} />
      </div>
    </div>
  );
}
