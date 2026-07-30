import { useState } from "react";

import { PageHeading } from "../components/PageHeading";

type LegGroup = "front_left" | "front_right" | "rear_left" | "rear_right";

interface LegDefinition {
  readonly group: LegGroup;
  readonly label: string;
  readonly frontDirection: -1 | 1;
}

const LEGS: readonly LegDefinition[] = [
  { group: "front_left", label: "左前腿", frontDirection: 1 },
  { group: "front_right", label: "右前腿", frontDirection: -1 },
  { group: "rear_left", label: "左后腿", frontDirection: 1 },
  { group: "rear_right", label: "右后腿", frontDirection: -1 }
];

/** Four-leg CAN actuator controls with mirrored left/right direction semantics. */
export function CanPage(): React.JSX.Element {
  const [stepDeg, setStepDeg] = useState(4);
  const [speedRaw, setSpeedRaw] = useState(0);

  const jog = (leg: LegDefinition, direction: -1 | 1): void => {
    void window.rescue.invokeCapability({
      name: "can",
      body: {
        action: "jog",
        group: leg.group,
        direction,
        stepDeg,
        speedRaw
      }
    });
  };

  return (
    <div className="page can-page">
      <PageHeading
        description="左腿向前为正、右腿向前为负；方向语义与当前真机映射一致"
        kicker="CAN LEGS / 03"
        title="四腿执行器"
      />
      <section className="parameter-strip">
        <label>
          角度步进
          <input
            max="20"
            min="1"
            onChange={(event) => setStepDeg(Number(event.currentTarget.value))}
            type="number"
            value={stepDeg}
          />
          <span>deg</span>
        </label>
        <label>
          速度参数
          <input
            max="1280"
            min="0"
            onChange={(event) => setSpeedRaw(Number(event.currentTarget.value))}
            type="number"
            value={speedRaw}
          />
          <span>raw</span>
        </label>
      </section>
      <div className="leg-grid">
        {LEGS.map((leg, index) => (
          <article className={`leg-module ${leg.group}`} key={leg.group}>
            <div>
              <span>LEG {String(index + 1).padStart(2, "0")}</span>
              <strong>{leg.label}</strong>
            </div>
            <div className="leg-visual" aria-hidden="true">
              <i />
              <b />
              <span>{index < 2 ? "FRONT" : "REAR"}</span>
            </div>
            <div className="leg-actions">
              <button
                aria-label={`${leg.label}向后`}
                onClick={() => jog(leg, leg.frontDirection === 1 ? -1 : 1)}
                type="button"
              >
                后
              </button>
              <button
                aria-label={`${leg.label}向前`}
                onClick={() => jog(leg, leg.frontDirection)}
                type="button"
              >
                前
              </button>
              <button
                onClick={() =>
                  void window.rescue.invokeCapability({
                    name: "can",
                    body: { action: "read", group: leg.group }
                  })
                }
                type="button"
              >
                读取状态
              </button>
            </div>
            <footer>
              <span>POSITION</span>
              <strong>---- raw</strong>
              <i>等待反馈</i>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
