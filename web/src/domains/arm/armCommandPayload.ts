import {
  isValidServoId,
  normalizeServoProfile,
  type ServoProfile
} from "@adapters/hardware/protocol";
import {
  normalizeArmConfig,
  type ArmConfig
} from "@adapters/persistence/storage";

export function servoProfilesFromCommandPayload(payload: Record<string, unknown>): ServoProfile[] {
  if (!Array.isArray(payload.servos)) {
    return [];
  }
  return payload.servos
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const draft = item as Partial<ServoProfile>;
      const id = Number(draft.id);
      if (!Number.isInteger(id) || !isValidServoId(id)) {
        return null;
      }
      return normalizeServoProfile({
        id,
        name: typeof draft.name === "string" && draft.name.trim() ? draft.name : `ID${id}`,
        minDeg: typeof draft.minDeg === "number" ? draft.minDeg : undefined,
        maxDeg: typeof draft.maxDeg === "number" ? draft.maxDeg : undefined,
        zeroOffset: typeof draft.zeroOffset === "number" ? draft.zeroOffset : undefined,
        direction: draft.direction === -1 ? -1 : 1
      });
    })
    .filter((servo): servo is ServoProfile => servo !== null);
}

export function armConfigFromCommandPayload(
  payload: Record<string, unknown>,
  servos: ServoProfile[],
  commandServos = servoProfilesFromCommandPayload(payload)
): ArmConfig {
  return normalizeArmConfig(
    {
      joints: Array.isArray(payload.joints) ? payload.joints : [],
      liveDragEnabled: payload.live === true,
      selectedJointId: null
    },
    mergeServoProfiles(servos, commandServos)
  );
}

function mergeServoProfiles(baseServos: ServoProfile[], extraServos: ServoProfile[]) {
  const byId = new Map<number, ServoProfile>();
  for (const servo of [...baseServos, ...extraServos]) {
    byId.set(servo.id, normalizeServoProfile(servo));
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}
