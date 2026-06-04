import { PlatformPluginPackage } from "../../platform/types";

export const coreCapabilitiesPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.core-capabilities",
    name: "Core Capabilities",
    version: "0.1.0",
    description: "Shared robot capability definitions used by built-in drivers.",
    provides: ["capability.servo", "capability.motor", "capability.camera", "capability.robot-arm", "capability.raspberry-pi", "capability.firmware", "capability.gamepad"]
  },
  plugins: [
    {
      id: "capability.servo",
      kind: "capability",
      name: "Servo",
      version: "0.1.0",
      capability: "servo",
      actions: [
        { id: "scan", label: "Scan", commandType: "servo.ping" },
        { id: "set_position", label: "Set position", commandType: "servo.set_position" },
        { id: "set_speed", label: "Set speed", commandType: "servo.set_speed" },
        { id: "enable_torque", label: "Enable torque", commandType: "servo.set_torque" },
        { id: "read_position", label: "Read position", commandType: "servo.read_feedback" }
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
        { id: "configure", label: "Configure", commandType: "motor.configure" },
        { id: "set_speed", label: "Set speed", commandType: "motor.set_speed" },
        { id: "stop", label: "Stop", commandType: "motor.stop" },
        { id: "read_feedback", label: "Read feedback", commandType: "motor.read_feedback" }
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
        { id: "open_stream", label: "Open stream", commandType: "camera.stream.start" },
        { id: "stop_stream", label: "Stop stream", commandType: "camera.stream.stop" },
        { id: "move_gimbal", label: "Move gimbal", commandType: "camera.set_gimbal" },
        { id: "center_gimbal", label: "Center gimbal", commandType: "camera.center_gimbal" }
      ],
      stateFields: ["sourceId", "streamUrl", "devicePath", "port", "webrtcOfferUrl", "streamMode", "latencyProfile", "panAngleDeg", "tiltAngleDeg"]
    },
    {
      id: "capability.robot-arm",
      kind: "capability",
      name: "Robot Arm",
      version: "0.1.0",
      capability: "robot-arm",
      actions: [
        { id: "set_pose", label: "Set pose", commandType: "robot-arm.set_pose" },
        { id: "pause", label: "Pause", commandType: "robot-arm.pause" },
        { id: "teach_start", label: "Start teach", commandType: "robot-arm.teach.start" },
        { id: "teach_stop", label: "Stop teach", commandType: "robot-arm.teach.stop" },
        { id: "teach_play", label: "Play teach", commandType: "robot-arm.teach.play" }
      ],
      stateFields: ["jointCount", "selectedJointId", "liveDragEnabled"]
    },
    {
      id: "capability.raspberry-pi",
      kind: "capability",
      name: "Raspberry Pi Remote",
      version: "0.1.0",
      capability: "raspberry-pi",
      actions: [
        { id: "check", label: "Check", commandType: "pi.check" },
        { id: "setup", label: "Setup", commandType: "pi.setup" },
        { id: "upload_file", label: "Upload file", commandType: "pi.upload_file" },
        { id: "exec", label: "Execute", commandType: "pi.exec" },
        { id: "upload_and_exec", label: "Upload and execute", commandType: "pi.upload_and_exec" },
        { id: "camera_check", label: "Check camera", commandType: "pi.camera.check" },
        { id: "camera_start", label: "Start camera", commandType: "pi.camera.start" },
        { id: "camera_stop", label: "Stop camera", commandType: "pi.camera.stop" },
        { id: "camera_install_tools", label: "Install camera tools", commandType: "pi.camera.install_tools" }
      ],
      stateFields: ["target", "helperReady", "connectionReady", "cameraReady", "lastExitCode", "lastOutput"]
    },
    {
      id: "capability.firmware",
      kind: "capability",
      name: "Firmware Upload",
      version: "0.1.0",
      capability: "firmware",
      actions: [
        { id: "helper_check", label: "Check helper", commandType: "firmware.helper.check" },
        { id: "ports_refresh", label: "Refresh ports", commandType: "firmware.ports.refresh" },
        { id: "compile", label: "Compile", commandType: "firmware.compile" },
        { id: "upload", label: "Upload", commandType: "firmware.upload" }
      ],
      stateFields: ["board", "port", "helperReady", "busy", "status", "hexSizeBytes", "logs"]
    },
    {
      id: "capability.gamepad",
      kind: "capability",
      name: "Gamepad",
      version: "0.1.0",
      capability: "gamepad",
      actions: [],
      stateFields: ["connected", "index", "id", "mapping", "axes", "buttons", "axesValues", "pressedButtons", "forward", "strafe", "turn", "cameraPan", "cameraTilt", "stop"]
    }
  ]
};
