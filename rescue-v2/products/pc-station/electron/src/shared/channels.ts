/** Closed IPC channel names shared by Electron main and preload. */
export const CHANNELS = {
  getHealth: "rescue:health:get",
  healthChanged: "rescue:health:changed",
  operation: "rescue:operation",
  setMotion: "rescue:control:set-motion",
  clearMotion: "rescue:control:clear-motion",
  setSpeedLimits: "rescue:control:set-speed-limits",
  arm: "rescue:control:arm",
  stop: "rescue:control:stop",
  capability: "rescue:capability:invoke",
  restart: "rescue:software:restart"
} as const;
