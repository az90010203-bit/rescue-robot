import type { ArmConfig, ArmPoint, ArmSegmentPose } from "@adapters/persistence/storage";

export interface ArmThreePoint {
  x: number;
  y: number;
  z: number;
}

export interface ArmThreeLink {
  angleDeg: number;
  enabled: boolean;
  end: ArmThreePoint;
  id: string;
  jointId: string;
  length: number;
  midpoint: ArmThreePoint;
  name: string;
  selected: boolean;
  servoId: number;
  start: ArmThreePoint;
}

export interface ArmThreeJointMarker {
  enabled: boolean;
  id: string;
  jointId: string;
  name: string;
  point: ArmThreePoint;
  selected: boolean;
  servoId: number;
}

export interface ArmThreeModel {
  base: ArmThreePoint;
  endEffector: ArmThreePoint;
  isEmpty: boolean;
  jointMarkers: ArmThreeJointMarker[];
  links: ArmThreeLink[];
}

export interface ArmThreeModelOptions {
  origin?: ArmPoint;
  scale?: number;
}

export const DEFAULT_ARM_THREE_ORIGIN: ArmPoint = { x: 300, y: 250 };
export const DEFAULT_ARM_THREE_SCALE = 0.018;

export function buildArmThreeModel(
  armConfig: ArmConfig,
  armSegmentPoses: ArmSegmentPose[],
  options: ArmThreeModelOptions = {}
): ArmThreeModel {
  const origin = options.origin ?? DEFAULT_ARM_THREE_ORIGIN;
  const scale = positiveNumber(options.scale, DEFAULT_ARM_THREE_SCALE);
  const jointById = new Map(armConfig.joints.map((joint) => [joint.id, joint]));
  const base = armPointToThreePoint(origin, { origin, scale });
  const links: ArmThreeLink[] = [];
  const jointMarkers: ArmThreeJointMarker[] = [];

  for (const pose of armSegmentPoses) {
    const joint = jointById.get(pose.jointId);
    const selected = armConfig.selectedJointId === pose.jointId;
    const enabled = joint?.enabled ?? true;

    jointMarkers.push({
      enabled,
      id: `${pose.jointId}:joint`,
      jointId: pose.jointId,
      name: pose.name,
      point: armPointToThreePoint({ x: pose.startX, y: pose.startY }, { origin, scale }),
      selected,
      servoId: pose.servoId
    });

    pose.shapeSegments.forEach((segment, index) => {
      const start = armPointToThreePoint({ x: segment.startX, y: segment.startY }, { origin, scale });
      const end = armPointToThreePoint({ x: segment.endX, y: segment.endY }, { origin, scale });
      links.push({
        angleDeg: segment.globalDeg,
        enabled,
        end,
        id: `${pose.jointId}:${segment.id || index}`,
        jointId: pose.jointId,
        length: distance3d(start, end),
        midpoint: midpoint3d(start, end),
        name: segment.name,
        selected,
        servoId: pose.servoId,
        start
      });
    });
  }

  const lastPose = armSegmentPoses[armSegmentPoses.length - 1];
  const endEffector = lastPose ? armPointToThreePoint({ x: lastPose.endX, y: lastPose.endY }, { origin, scale }) : base;

  return {
    base,
    endEffector,
    isEmpty: armConfig.joints.length === 0 || armSegmentPoses.length === 0,
    jointMarkers,
    links
  };
}

export function armPointToThreePoint(point: ArmPoint, options: ArmThreeModelOptions = {}): ArmThreePoint {
  const origin = options.origin ?? DEFAULT_ARM_THREE_ORIGIN;
  const scale = positiveNumber(options.scale, DEFAULT_ARM_THREE_SCALE);
  return {
    x: (point.x - origin.x) * scale,
    y: (origin.y - point.y) * scale,
    z: 0
  };
}

export function threePointToArmPoint(point: ArmThreePoint, options: ArmThreeModelOptions = {}): ArmPoint {
  const origin = options.origin ?? DEFAULT_ARM_THREE_ORIGIN;
  const scale = positiveNumber(options.scale, DEFAULT_ARM_THREE_SCALE);
  return {
    x: origin.x + point.x / scale,
    y: origin.y - point.y / scale
  };
}

function midpoint3d(a: ArmThreePoint, b: ArmThreePoint): ArmThreePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2
  };
}

function distance3d(a: ArmThreePoint, b: ArmThreePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
