import { useEffect, useRef, useState } from "react";

import {
  SPEED_MODES,
  computeMecanumTarget,
  computeTrackedTarget,
  nextSpeedLevel,
  type MotionControl
} from "../../core/motion";
import type { AgentHealth } from "../../shared/contracts";
import { HoldButton } from "../components/HoldButton";
import { PageHeading } from "../components/PageHeading";
import { StatusCard } from "../components/StatusCard";

interface DrivePageProps {
  readonly health: AgentHealth | null;
}

type DriveMode = "mecanum" | "tracked";

const KEY_CONTROLS: Readonly<Record<string, MotionControl>> = {
  KeyW: "forward",
  KeyS: "backward",
  KeyA: "left",
  KeyD: "right",
  KeyQ: "turn-left",
  KeyE: "turn-right"
};

/**
 * Whole-robot drive page with controller-compatible speed modes.
 *
 * UI motion is normalized locally, then scheduled by Electron main at 20 Hz.
 */
export function DrivePage({ health }: DrivePageProps): React.JSX.Element {
  const [driveMode, setDriveMode] = useState<DriveMode>("mecanum");
  const [controls, setControls] = useState<ReadonlySet<MotionControl>>(new Set());
  const [speedLevel, setSpeedLevel] = useState<number | null>(1);
  const [mecanumSpeed, setMecanumSpeed] = useState(50);
  const [trackedSpeed, setTrackedSpeed] = useState(60);
  const lHeld = useRef(false);
  const lTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishControls = (
    nextControls: ReadonlySet<MotionControl>,
    mode: DriveMode = driveMode
  ): void => {
    setControls(nextControls);
    if (nextControls.size === 0) {
      void window.rescue.clearMotion();
      return;
    }
    if (mode === "tracked") {
      const target = computeTrackedTarget(nextControls);
      void window.rescue.setMotion({
        mode,
        ...target,
        speedLimitPercent: trackedSpeed
      });
      return;
    }
    const target = computeMecanumTarget(nextControls);
    void window.rescue.setMotion({
      mode,
      ...target,
      speedLimitPercent: mecanumSpeed
    });
  };

  const setControl = (control: MotionControl, active: boolean): void => {
    const next = new Set(controls);
    if (active) {
      next.add(control);
    } else {
      next.delete(control);
    }
    publishControls(next);
  };

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void window.rescue.stop("electron_space_emergency_stop");
        return;
      }
      const control = KEY_CONTROLS[event.code];
      if (control !== undefined && driveMode === "mecanum") {
        event.preventDefault();
        setControl(control, true);
      }
    };
    const keyUp = (event: KeyboardEvent): void => {
      const control = KEY_CONTROLS[event.code];
      if (control !== undefined && driveMode === "mecanum") {
        event.preventDefault();
        setControl(control, false);
      }
    };
    const release = (): void => {
      publishControls(new Set());
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
      if (lTimer.current !== null) {
        clearTimeout(lTimer.current);
        lTimer.current = null;
      }
    };
  });

  const applySpeedLevel = (level: number): void => {
    const speed = SPEED_MODES[level];
    if (speed === undefined) {
      return;
    }
    setSpeedLevel(level);
    setMecanumSpeed(speed.mecanum);
    setTrackedSpeed(speed.tracked);
    void window.rescue.setSpeedLimits({
      mecanumPercent: speed.mecanum,
      trackedPercent: speed.tracked
    });
  };

  const beginL = (): void => {
    lHeld.current = false;
    lTimer.current = setTimeout(() => {
      lHeld.current = true;
      applySpeedLevel(nextSpeedLevel(speedLevel));
    }, 700);
  };

  const endL = (): void => {
    if (lTimer.current !== null) {
      clearTimeout(lTimer.current);
      lTimer.current = null;
    }
    if (!lHeld.current) {
      const nextMode: DriveMode = driveMode === "mecanum" ? "tracked" : "mecanum";
      publishControls(new Set(), nextMode);
      setDriveMode(nextMode);
    }
  };

  const updateCustomSpeed = (mode: DriveMode, value: number): void => {
    setSpeedLevel(null);
    if (mode === "mecanum") {
      setMecanumSpeed(value);
      void window.rescue.setSpeedLimits({
        mecanumPercent: value,
        trackedPercent: trackedSpeed
      });
    } else {
      setTrackedSpeed(value);
      void window.rescue.setSpeedLimits({
        mecanumPercent: mecanumSpeed,
        trackedPercent: value
      });
    }
  };

  const activeMode = speedLevel === null ? "CUSTOM MODE" : SPEED_MODES[speedLevel]?.name;
  const controller = health?.controller;
  const pi = health?.pi;

  return (
    <div className="page drive-page">
      <PageHeading
        description="实体控制器优先；键盘与触摸命令通过独立 Agent 安全调度"
        kicker="DRIVE / 01"
        title="底盘与履带"
      />
      <div className="status-grid four">
        <StatusCard
          label="PC AGENT"
          state={health === null ? "bad" : "good"}
          value={health === null ? "离线" : "在线"}
        />
        <StatusCard
          label="树莓派协调器"
          state={pi?.ok ? "good" : "bad"}
          value={pi?.service ?? "等待连接"}
        />
        <StatusCard
          label="ROBOMASTER A"
          state={pi?.serialOpen ? "good" : "bad"}
          value={pi?.serialOpen ? "串口在线" : "串口离线"}
        />
        <StatusCard
          detail={controller?.fresh ? `${controller.frameAgeMs ?? "--"} ms` : undefined}
          label="ESP32PLUS"
          state={controller?.connected ? "good" : "warning"}
          value={controller?.connected ? "控制器在线" : "等待控制器"}
        />
      </div>

      <section className="drive-command-strip">
        <HoldButton
          className={`mode-switch ${driveMode}`}
          onHoldEnd={endL}
          onHoldStart={beginL}
        >
          <span>L · {driveMode === "mecanum" ? "麦轮" : "履带"}</span>
          <strong>{activeMode ?? "CUSTOM MODE"}</strong>
          <small>短按切底盘 · 长按换挡</small>
        </HoldButton>
        <label>
          麦轮 <b>{mecanumSpeed}%</b>
          <input
            max="70"
            min="30"
            onChange={(event) =>
              updateCustomSpeed("mecanum", Number(event.currentTarget.value))
            }
            type="range"
            value={mecanumSpeed}
          />
        </label>
        <label>
          履带 <b>{trackedSpeed}%</b>
          <input
            max="100"
            min="30"
            onChange={(event) =>
              updateCustomSpeed("tracked", Number(event.currentTarget.value))
            }
            type="range"
            value={trackedSpeed}
          />
        </label>
      </section>

      {driveMode === "mecanum" ? (
        <section className="control-panel mecanum-panel">
          <h3>麦克纳姆底盘</h3>
          <div className="mecanum-grid">
            {[
              ["左转 Q", "turn-left"],
              ["前进 W", "forward"],
              ["右转 E", "turn-right"],
              ["左移 A", "left"],
              ["后退 S", "backward"],
              ["右移 D", "right"]
            ].map(([label, control]) => (
              <HoldButton
                aria-label={label}
                className={controls.has(control as MotionControl) ? "active" : ""}
                key={control}
                onHoldEnd={() => setControl(control as MotionControl, false)}
                onHoldStart={() => setControl(control as MotionControl, true)}
              >
                {label}
              </HoldButton>
            ))}
          </div>
        </section>
      ) : (
        <section className="control-panel tracked-panel">
          <h3>独立履带</h3>
          <div className="tracked-grid">
            {[
              ["左履带向前", "left-forward"],
              ["右履带向前", "right-forward"],
              ["左履带向后", "left-backward"],
              ["右履带向后", "right-backward"]
            ].map(([label, control]) => (
              <HoldButton
                aria-label={label}
                className={controls.has(control as MotionControl) ? "active" : ""}
                key={control}
                onHoldEnd={() => setControl(control as MotionControl, false)}
                onHoldStart={() => setControl(control as MotionControl, true)}
              >
                {label}
              </HoldButton>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
