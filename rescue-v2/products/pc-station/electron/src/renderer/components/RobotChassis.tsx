import type { MotionControl } from "../../core/motion";

interface RobotChassisProps {
  readonly controls: ReadonlySet<MotionControl>;
  readonly driveMode: "mecanum" | "tracked";
  readonly speedName: string;
}

function motionLabel(controls: ReadonlySet<MotionControl>): string {
  if (controls.size === 0) {
    return "STANDBY";
  }
  return [...controls]
    .map((control) => control.toUpperCase().replace("-", " "))
    .join(" + ");
}

/** Original top-down robot diagram. It reflects UI intent only, never hardware state. */
export function RobotChassis({
  controls,
  driveMode,
  speedName
}: RobotChassisProps): React.JSX.Element {
  const moving = controls.size > 0;
  return (
    <div
      aria-label="机器人底盘俯视状态图"
      className={`robot-chassis ${driveMode} ${moving ? "moving" : "idle"}`}
      role="img"
    >
      <div className="chassis-axis axis-x" />
      <div className="chassis-axis axis-y" />
      <div className="motion-vector">
        <i />
        <span>{motionLabel(controls)}</span>
      </div>
      <div className="wheel wheel-fl"><span>FL</span></div>
      <div className="wheel wheel-fr"><span>FR</span></div>
      <div className="wheel wheel-rl"><span>RL</span></div>
      <div className="wheel wheel-rr"><span>RR</span></div>
      <div className="chassis-body">
        <div className="signature-rail" />
        <small>RESCUE V2</small>
        <strong>{driveMode === "mecanum" ? "MECANUM" : "TRACKED"}</strong>
        <span>{speedName}</span>
        <div className="core-status">
          <i />
          {moving ? "UI MOTION INTENT" : "UI STANDBY"}
        </div>
      </div>
      <div className="chassis-scale top">FRONT</div>
      <div className="chassis-scale bottom">REAR</div>
    </div>
  );
}
