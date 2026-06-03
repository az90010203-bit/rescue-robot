import { PlatformPluginPackage } from "../../platform/types";

export const coreCapabilitiesPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.core-capabilities",
    name: "Core Capabilities",
    version: "0.1.0",
    description: "Shared robot capability definitions used by built-in drivers.",
    provides: ["capability.servo", "capability.motor", "capability.camera", "capability.robot-arm"]
  },
  plugins: [
    {
      id: "capability.servo",
      kind: "capability",
      name: "Servo",
      version: "0.1.0",
      capability: "servo",
      actions: [
        { id: "scan", label: "Scan" },
        { id: "set_position", label: "Set position", commandType: "servo.move" },
        { id: "set_speed", label: "Set speed", commandType: "servo.speed" },
        { id: "enable_torque", label: "Enable torque", commandType: "servo.torque" },
        { id: "read_position", label: "Read position", commandType: "servo.read" }
      ],
      stateFields: ["positionRaw", "speedRaw", "loadRaw", "voltageRaw", "temperatureC", "moving", "currentRaw"]
    },
    {
      id: "capability.motor",
      kind: "capability",
      name: "Motor",
      version: "0.1.0",
      capability: "motor",
      actions: [
        { id: "configure", label: "Configure", commandType: "motor.config" },
        { id: "set_speed", label: "Set speed", commandType: "motor.set" },
        { id: "stop", label: "Stop", commandType: "motor.stop" },
        { id: "read_feedback", label: "Read feedback", commandType: "motor.read" }
      ],
      stateFields: ["commandedSpeedPercent", "dutyPercent", "direction", "stopMode", "speedRpm", "pulseHz", "encoderTicks"]
    },
    {
      id: "capability.camera",
      kind: "capability",
      name: "Camera",
      version: "0.1.0",
      capability: "camera",
      actions: [
        { id: "open_stream", label: "Open stream" },
        { id: "move_gimbal", label: "Move gimbal", commandType: "servo.move" }
      ],
      stateFields: ["streamUrl", "panAngleDeg", "tiltAngleDeg"]
    },
    {
      id: "capability.robot-arm",
      kind: "capability",
      name: "Robot Arm",
      version: "0.1.0",
      capability: "robot-arm",
      actions: [
        { id: "move_joint", label: "Move joint", commandType: "servo.move" },
        { id: "pause", label: "Pause" }
      ],
      stateFields: ["jointCount", "selectedJointId", "liveDragEnabled"]
    }
  ]
};
