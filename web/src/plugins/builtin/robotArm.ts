import { PlatformPluginPackage } from "../../platform/types";

export const robotArmPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.robot-arm",
    name: "Robot Arm",
    version: "0.1.0",
    description: "Composite robot arm driver and teach/playback UI schema.",
    provides: ["driver.robot-arm-composite", "ui.robot-arm-control"],
    requires: ["capability.robot-arm", "transport.web-serial", "driver.feetech-servo"]
  },
  plugins: [
    {
      id: "driver.robot-arm-composite",
      kind: "driver",
      name: "Robot Arm Composite",
      version: "0.1.0",
      provides: ["robot-arm"],
      requiresTransport: ["transport.web-serial"],
      protocol: "feetech-ttl-bus"
    }
  ],
  uiPanels: [
    {
      id: "robot-arm-control",
      title: "Robot Arm Control",
      capability: "robot-arm",
      controls: [
        { id: "joint-count", kind: "metric", label: "Joints", capability: "robot-arm", stateField: "jointCount" },
        { id: "selected-joint", kind: "metric", label: "Selected Joint", capability: "robot-arm", stateField: "selectedJointId" },
        { id: "live-drag", kind: "metric", label: "Live Drag", capability: "robot-arm", stateField: "liveDragEnabled" },
        { id: "pose", kind: "button", label: "Send Pose", capability: "robot-arm", actionId: "set_pose" },
        { id: "pause", kind: "button", label: "Pause", capability: "robot-arm", actionId: "pause" },
        { id: "teach-start", kind: "button", label: "Start Teach", capability: "robot-arm", actionId: "teach_start" },
        { id: "teach-stop", kind: "button", label: "Stop Teach", capability: "robot-arm", actionId: "teach_stop" },
        { id: "teach-play", kind: "button", label: "Play Teach", capability: "robot-arm", actionId: "teach_play" }
      ]
    }
  ]
};
