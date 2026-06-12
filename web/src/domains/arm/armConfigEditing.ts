import {
  ARM_MAX_JOINT_LENGTH_PX,
  ARM_MIN_JOINT_LENGTH_PX,
  armJointShapeSegments,
  type ArmJointConfig
} from "@adapters/persistence/storage";
import { clamp, servoLogicalSpan, type ServoProfile } from "@adapters/hardware/protocol";

export type ArmJointNumberField = "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc";

export function updateArmJointNumberValue(
  joint: ArmJointConfig,
  field: ArmJointNumberField,
  numericValue: number,
  servo: ServoProfile | null | undefined
): ArmJointConfig {
  const span = servo ? servoLogicalSpan(servo) : 360;
  if (field === "lengthPx") {
    const lengthPx = clamp(Math.round(numericValue), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX);
    const shapeSegments = armJointShapeSegments(joint).map((segment, index) => (index === 0 ? { ...segment, lengthPx } : segment));
    return { ...joint, lengthPx, shapeSegments };
  }
  if (field === "speedRaw") {
    return { ...joint, speedRaw: clamp(Math.round(numericValue), 0, 4095) };
  }
  if (field === "acc") {
    return { ...joint, acc: clamp(Math.round(numericValue), 0, 254) };
  }
  return { ...joint, [field]: clamp(numericValue, 0, span) };
}
