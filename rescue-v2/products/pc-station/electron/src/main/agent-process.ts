import { app } from "electron";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import type { AgentClient } from "./agent-client";

const DEVELOPMENT_PYTHON =
  "C:\\Users\\47459\\.platformio\\penv\\Scripts\\python.exe";

/**
 * Starts the independent Agent only when its loopback health endpoint is absent.
 *
 * The child is detached so an Electron crash cannot terminate the Agent before
 * its watchdog has stopped the robot.
 *
 * @param client - Agent health client
 */
export async function ensureAgentRunning(client: AgentClient): Promise<void> {
  if (await agentResponds(client)) {
    return;
  }
  const command = await resolveAgentCommand();
  const child = spawn(command.executable, command.arguments, {
    cwd: command.workingDirectory,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await delay(100);
    if (await agentResponds(client)) {
      return;
    }
  }
  throw new Error("独立控制 Agent 未能在 5 秒内启动");
}

interface AgentCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
}

async function resolveAgentCommand(): Promise<AgentCommand> {
  if (app.isPackaged) {
    const executable = path.join(
      process.resourcesPath,
      "agent",
      "rescue-control-agent.exe"
    );
    await access(executable);
    return {
      executable,
      arguments: ["--pi-host", "192.168.55.131", "--controller-port", "COM5"],
      workingDirectory: path.dirname(executable)
    };
  }
  const stationRoot = path.resolve(app.getAppPath(), "..");
  const script = path.join(stationRoot, "agent", "rescue_agent.py");
  await access(script);
  return {
    executable: process.env.RESCUE_PYTHON ?? DEVELOPMENT_PYTHON,
    arguments: [
      script,
      "--pi-host",
      "192.168.55.131",
      "--controller-port",
      "COM5"
    ],
    workingDirectory: stationRoot
  };
}

async function agentResponds(client: AgentClient): Promise<boolean> {
  try {
    await client.health();
    return true;
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
