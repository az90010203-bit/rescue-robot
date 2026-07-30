import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  net,
  protocol,
  session
} from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { AgentClient } from "./main/agent-client";
import { ensureAgentRunning } from "./main/agent-process";
import { OperatorService } from "./main/operator-service";
import { resolveRendererAsset } from "./main/renderer-protocol";
import type { AgentHealth } from "./shared/contracts";
import { CHANNELS } from "./shared/channels";
import type { OperationNotice } from "./shared/bridge";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const agent = new AgentClient("http://127.0.0.1:18400");
const operator = new OperatorService(agent);
const shouldLaunch = !squirrelStartup && app.requestSingleInstanceLock();
let window: BrowserWindow | null = null;
let latestHealth: AgentHealth | null = null;
let operatorActive = false;
let shuttingDown = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let motionTimer: ReturnType<typeof setInterval> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let healthPolling = false;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId(
  "com.squirrel.RescueV2ControlStation.RescueV2ControlStation"
);

if (!shouldLaunch) {
  app.quit();
}

if (shouldLaunch) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "rescue",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        codeCache: true
      }
    }
  ]);
}

app.on("second-instance", () => {
  if (window === null || window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
});

function report(notice: OperationNotice): void {
  if (window !== null && !window.isDestroyed()) {
    window.webContents.send(CHANNELS.operation, notice);
  }
}

function reportError(error: unknown): void {
  report({
    level: "error",
    message: error instanceof Error ? error.message : "控制请求失败"
  });
}

async function setOperatorActive(active: boolean, reason: string): Promise<void> {
  if (operatorActive === active) {
    return;
  }
  operatorActive = active;
  if (active) {
    try {
      await operator.heartbeatTick();
    } catch (error) {
      reportError(error);
    }
    return;
  }
  try {
    await operator.deactivate(reason);
  } catch (error) {
    reportError(error);
  }
}

async function pollHealth(): Promise<void> {
  if (healthPolling) {
    return;
  }
  healthPolling = true;
  try {
    latestHealth = await agent.health();
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.healthChanged, latestHealth);
    }
  } catch (error) {
    latestHealth = null;
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.healthChanged, null);
    }
    report({
      level: "error",
      message: error instanceof Error ? error.message : "控制 Agent 离线"
    });
  } finally {
    healthPolling = false;
  }
}

function startSchedulers(): void {
  heartbeatTimer = setInterval(() => {
    if (operatorActive) {
      void operator.heartbeatTick().catch(reportError);
    }
  }, 100);
  motionTimer = setInterval(() => {
    if (operatorActive) {
      void operator.motionTick().catch(reportError);
    }
  }, 50);
  healthTimer = setInterval(() => void pollHealth(), 500);
  void pollHealth();
}

function stopSchedulers(): void {
  for (const timer of [heartbeatTimer, motionTimer, healthTimer]) {
    if (timer !== null) {
      clearInterval(timer);
    }
  }
  heartbeatTimer = null;
  motionTimer = null;
  healthTimer = null;
}

function assertTrusted(event: IpcMainInvokeEvent): void {
  if (window === null || window.isDestroyed() || event.sender !== window.webContents) {
    throw new Error("拒绝非控制站窗口发出的 IPC 请求");
  }
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.getHealth, (event) => {
    assertTrusted(event);
    return latestHealth;
  });
  ipcMain.handle(CHANNELS.setMotion, (event, input: unknown) => {
    assertTrusted(event);
    operator.setMotion(input);
  });
  ipcMain.handle(CHANNELS.clearMotion, async (event) => {
    assertTrusted(event);
    await operator.deactivate("electron_motion_released");
  });
  ipcMain.handle(CHANNELS.setSpeedLimits, async (event, input: unknown) => {
    assertTrusted(event);
    await operator.setSpeedLimits(input);
  });
  ipcMain.handle(CHANNELS.arm, async (event) => {
    assertTrusted(event);
    await operator.arm();
  });
  ipcMain.handle(CHANNELS.stop, async (event, reason: unknown) => {
    assertTrusted(event);
    await operator.deactivate(reason);
  });
  ipcMain.handle(CHANNELS.capability, async (event, input: unknown) => {
    assertTrusted(event);
    await operator.invokeCapability(input);
  });
  ipcMain.handle(CHANNELS.restart, async (event) => {
    assertTrusted(event);
    await operator.deactivate("electron_software_restart");
    launchRestartHelper();
  });
}

function launchRestartHelper(): void {
  const stationRoot = path.resolve(app.getAppPath(), "..");
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "restart-electron.ps1")
    : path.join(stationRoot, "restart-electron.ps1");
  const restartArguments = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-CurrentPid",
    String(process.pid),
    "-ElectronDirectory",
    app.getAppPath(),
    "-ElectronExecutable",
    process.execPath,
    "-Packaged",
    String(app.isPackaged)
  ];
  const helper = spawn("powershell.exe", restartArguments, {
    cwd: stationRoot,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  helper.unref();
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#050607",
    show: false,
    title: "Rescue V2 Electron 控制站",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.setMenuBarVisibility(false);

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("render-process-gone", () => {
    void setOperatorActive(false, "electron_renderer_gone");
  });
  window.on("focus", () => void setOperatorActive(true, "electron_window_focused"));
  window.on("blur", () => void setOperatorActive(false, "electron_window_blurred"));
  window.on("minimize", () => void setOperatorActive(false, "electron_window_minimized"));
  window.on("restore", () => {
    if (window?.isFocused()) {
      void setOperatorActive(true, "electron_window_restored");
    }
  });
  window.on("close", () => {
    void setOperatorActive(false, "electron_window_closed");
  });
  window.once("ready-to-show", () => {
    window?.show();
    window?.focus();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadURL("rescue://app/index.html");
  }
}

if (shouldLaunch) {
  void app.whenReady().then(async () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL === undefined) {
      const rendererRoot = path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}`
      );
      protocol.handle("rescue", (request) => {
        const assetPath = resolveRendererAsset(rendererRoot, request.url);
        if (assetPath === null) {
          return new Response("Not found", { status: 404 });
        }
        return net.fetch(pathToFileURL(assetPath).toString());
      });
    }
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => {
        callback(false);
      }
    );
    registerIpc();
    startSchedulers();
    try {
      await createWindow();
      void ensureAgentRunning(agent).catch(reportError);
    } catch (error) {
      reportError(error);
      app.quit();
    }
  });
}

app.on("before-quit", () => {
  shuttingDown = true;
  stopSchedulers();
  operator.clearMotion();
  void operator.deactivate("electron_app_quit").catch(() => undefined);
});

app.on("window-all-closed", () => {
  if (!shuttingDown) {
    app.quit();
  }
});
