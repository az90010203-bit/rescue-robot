import type { AboardBridgeStatus, AppSection, MotorTestBoard, TestPanel } from "./appModel";

interface AboardBridgeAutoCheckState {
  activeSection: AppSection;
  activeTest: TestPanel;
  alreadyCheckedHost: string;
  host: string;
  manualDisconnect: boolean;
  motorTestBoard: MotorTestBoard;
  status: AboardBridgeStatus;
}

export function shouldAutoCheckAboardBridge(state: AboardBridgeAutoCheckState): boolean {
  const host = state.host.trim();
  if (!host || state.manualDisconnect) {
    return false;
  }
  if (state.status === "connected" || state.status === "checking" || state.status === "starting") {
    return false;
  }
  if (state.alreadyCheckedHost === host) {
    return false;
  }
  return (
    state.activeSection === "console" ||
    (state.activeSection === "tests" && state.activeTest === "canServo") ||
    (state.activeSection === "tests" && state.activeTest === "motor" && state.motorTestBoard === "robomaster-a")
  );
}
