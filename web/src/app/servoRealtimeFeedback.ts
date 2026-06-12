import {
  FeetechStatusPacket,
  InboundMessage,
  parseServoFeedback,
  rawToAngleDeg
} from "@adapters/hardware/protocol";

export type ServoRealtimeFeedback = InboundMessage & { type: "servo.feedback" };

export function servoRealtimeFeedbackFromResponse(response: unknown): ServoRealtimeFeedback | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const message = response as Partial<ServoRealtimeFeedback>;
  if (message.type === "servo.feedback") {
    const positionDeg = typeof message.positionDeg === "number" && Number.isFinite(message.positionDeg)
      ? message.positionDeg
      : typeof message.positionRaw === "number" && Number.isFinite(message.positionRaw)
        ? rawToAngleDeg(message.positionRaw)
        : undefined;
    return {
      ...message,
      ...(positionDeg === undefined ? {} : { positionDeg })
    } as ServoRealtimeFeedback;
  }

  const packet = response as Partial<FeetechStatusPacket>;
  if (typeof packet.id === "number" && typeof packet.status === "number" && packet.status === 0 && Array.isArray(packet.params)) {
    return parseServoFeedback({
      id: packet.id,
      status: packet.status,
      params: packet.params,
      checksum: typeof packet.checksum === "number" ? packet.checksum : 0
    });
  }

  return null;
}
