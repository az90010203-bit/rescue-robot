import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppHeaderBar } from "@app/AppHeaderBar";

function isElement(node: ReactNode): node is ReactElement<{ children?: ReactNode; onClick?: () => void }> {
  return Boolean(node && typeof node === "object" && "props" in node);
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }
  if (isElement(node)) {
    return textContent(node.props.children);
  }
  return "";
}

function findButtonByTextOrNull(node: ReactNode, label: string): ReactElement | null {
  if (isElement(node) && typeof node.type === "function") {
    return findButtonByTextOrNull(node.type(node.props), label);
  }
  if (isElement(node) && node.type === "button" && textContent(node).includes(label)) {
    return node;
  }
  if (isElement(node)) {
    const children = node.props.children;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      const result = findButtonByTextOrNull(child, label);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

function findButtonByText(node: ReactNode, label: string): ReactElement {
  const button = findButtonByTextOrNull(node, label);
  if (button) {
    return button;
  }
  throw new Error(`button not found: ${label}`);
}

describe("AppHeaderBar bridge actions", () => {
  it("uses direct bridge checks from the header instead of SSH upgrade actions", () => {
    const checkAboardSerialBridge = vi.fn();
    const checkPiServoSerialBridge = vi.fn();
    const element = AppHeaderBar({
      aBoardBridgeBusy: false,
      aBoardBridgeConnected: false,
      aBoardBridgeDetail: "",
      aBoardBridgeLabel: "idle",
      aBoardBridgeTone: "neutral",
      activeModule: "servo",
      activeModuleLabel: "Servo",
      activeSection: "console",
      changeCurrentProject: vi.fn(),
      changeLanguage: vi.fn(),
      checkAboardSerialBridge,
      checkPiServoSerialBridge,
      createNewProject: vi.fn(),
      currentLanguage: "zh-CN",
      currentProject: null,
      databaseStatus: "saved",
      disconnectAboardSerialBridge: vi.fn(),
      disconnectPiServoSerialBridge: vi.fn(),
      newProjectName: "",
      piRemoteBusy: false,
      piRemoteCanConnect: true,
      piRemoteStatus: "idle",
      piRemoteStatusTone: "neutral",
      piRemoteTarget: "robot1@rescue-pi.local",
      piServoBridgeBusy: false,
      piServoBridgeConnected: false,
      piServoBridgeDetail: "",
      piServoBridgeLabel: "idle",
      piServoBridgeTone: "neutral",
      projects: [],
      selectSection: vi.fn(),
      setNewProjectName: vi.fn(),
      t: ((key: string) => key) as never,
      testRaspberryPiConnection: vi.fn(),
      webSerialAvailable: true
    });

    findButtonByText(element, "actions.connectPiServo").props.onClick();
    findButtonByText(element, "actions.connectAboard").props.onClick();

    expect(checkPiServoSerialBridge).toHaveBeenCalledTimes(1);
    expect(checkAboardSerialBridge).toHaveBeenCalledTimes(1);
  });
});
