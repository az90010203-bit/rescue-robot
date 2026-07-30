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
import { RobotChassis } from "../components/RobotChassis";
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
      <div className="status-grid four drive-status">
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

      <div className="drive-deck">
        <section className="control-panel motion-deck">
          <div className="panel-title">
            <span>MOTION VECTOR</span>
            <h3>{driveMode === "mecanum" ? "麦克纳姆全向控制" : "双履带独立控制"}</h3>
          </div>
          {driveMode === "mecanum" ? (
            <div className="chassis-control-grid">
              <HoldButton
                aria-label="左转 Q"
                className={`motion-key turn-left ${controls.has("turn-left") ? "active" : ""}`}
                onHoldEnd={() => setControl("turn-left", false)}
                onHoldStart={() => setControl("turn-left", true)}
              >
                <kbd>Q</kbd><span>左转</span>
              </HoldButton>
              <HoldButton
                aria-label="前进 W"
                className={`motion-key forward ${controls.has("forward") ? "active" : ""}`}
                onHoldEnd={() => setControl("forward", false)}
                onHoldStart={() => setControl("forward", true)}
              >
                <kbd>W</kbd><span>前进</span>
              </HoldButton>
              <HoldButton
                aria-label="右转 E"
                className={`motion-key turn-right ${controls.has("turn-right") ? "active" : ""}`}
                onHoldEnd={() => setControl("turn-right", false)}
                onHoldStart={() => setControl("turn-right", true)}
              >
                <kbd>E</kbd><span>右转</span>
              </HoldButton>
              <HoldButton
                aria-label="左移 A"
                className={`motion-key left ${controls.has("left") ? "active" : ""}`}
                onHoldEnd={() => setControl("left", false)}
                onHoldStart={() => setControl("left", true)}
              >
                <kbd>A</kbd><span>左移</span>
              </HoldButton>
              <RobotChassis
                controls={controls}
                driveMode={driveMode}
                speedName={activeMode ?? "CUSTOM MODE"}
              />
              <HoldButton
                aria-label="右移 D"
                className={`motion-key right ${controls.has("right") ? "active" : ""}`}
                onHoldEnd={() => setControl("right", false)}
                onHoldStart={() => setControl("right", true)}
              >
                <kbd>D</kbd><span>右移</span>
              </HoldButton>
              <div className="motion-spacer" />
              <HoldButton
                aria-label="后退 S"
                className={`motion-key backward ${controls.has("backward") ? "active" : ""}`}
                onHoldEnd={() => setControl("backward", false)}
                onHoldStart={() => setControl("backward", true)}
              >
                <kbd>S</kbd><span>后退</span>
              </HoldButton>
              <div className="motion-spacer" />
            </div>
          ) : (
            <div className="tracked-control-grid">
              <RobotChassis
                controls={controls}
                driveMode={driveMode}
                speedName={activeMode ?? "CUSTOM MODE"}
              />
              <div className="track-pair">
                {[
                  ["左履带前", "left-forward"],
                  ["右履带前", "right-forward"],
                  ["左履带后", "left-backward"],
                  ["右履带后", "right-backward"]
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
            </div>
          )}
        </section>

        <aside className="drive-tuning">
          <section className="tuning-module mode-module">
            <div className="module-heading">
              <span>DRIVE SELECT</span>
              <strong>底盘模式</strong>
            </div>
            <HoldButton
              className={`mode-switch ${driveMode}`}
              onHoldEnd={endL}
              onHoldStart={beginL}
            >
              <span>L / {driveMode === "mecanum" ? "MECANUM" : "TRACKED"}</span>
              <strong>{driveMode === "mecanum" ? "麦轮底盘" : "履带底盘"}</strong>
              <small>短按切底盘 · 长按循环换挡</small>
            </HoldButton>
          </section>

          <section className="tuning-module speed-module">
            <div className="module-heading">
              <span>POWER PROGRAM</span>
              <strong>{activeMode ?? "CUSTOM MODE"}</strong>
            </div>
            <div className="speed-programs" role="group" aria-label="速度档位">
              {[
                ["CRUISE", 0],
                ["TURBO", 1],
                ["HYPER", 2]
              ].map(([label, level]) => (
                <button
                  aria-label={String(label)}
                  className={speedLevel === level ? "active" : ""}
                  key={label}
                  onClick={() => applySpeedLevel(Number(level))}
                  type="button"
                >
                  <small>L{Number(level) + 1}</small>
                  <strong>{label}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="tuning-module limit-module">
            <div className="module-heading">
              <span>OUTPUT LIMIT</span>
              <strong>动力限制</strong>
            </div>
            <label>
              <span>麦轮</span>
              <b>{mecanumSpeed}%</b>
              <input
                aria-label="麦轮速度限制"
                max="70"
                min="30"
                onChange={(event) =>
                  updateCustomSpeed("mecanum", Number(event.currentTarget.value))
                }
                type="range"
                value={mecanumSpeed}
              />
              <small>30</small><small>70</small>
            </label>
            <label>
              <span>履带</span>
              <b>{trackedSpeed}%</b>
              <input
                aria-label="履带速度限制"
                max="100"
                min="30"
                onChange={(event) =>
                  updateCustomSpeed("tracked", Number(event.currentTarget.value))
                }
                type="range"
                value={trackedSpeed}
              />
              <small>30</small><small>100</small>
            </label>
          </section>

          <div className="keyboard-note">
            <span>KEYBOARD</span>
            <strong>WASD / QE</strong>
            <small>松键、失焦或切页立即清除运动命令</small>
          </div>
        </aside>
      </div>
    </div>
  );
}
