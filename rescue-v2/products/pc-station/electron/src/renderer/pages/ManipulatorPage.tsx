import { HoldButton } from "../components/HoldButton";
import { PageHeading } from "../components/PageHeading";

/** Logical arm, wrist and gripper controls without hardware identifiers. */
export function ManipulatorPage(): React.JSX.Element {
  const arm = (axis: "x" | "z" | "stop", value: -1 | 0 | 1): void => {
    void window.rescue.invokeCapability({ name: "arm", body: { axis, value } });
  };
  const claw = (value: -1 | 0 | 1): void => {
    void window.rescue.invokeCapability({
      name: "claw",
      body: { axis: "grip", value }
    });
  };

  return (
    <div className="page manipulator-page">
      <PageHeading
        description="只发送逻辑坐标；舵机 ID、限位和连杆约束继续由下层产品拥有"
        kicker="MANIPULATOR / 02"
        title="机械臂与末端"
      />
      <div className="manipulator-layout">
        <section className="arm-visual" aria-label="机械臂姿态示意">
          <div className="arm-visual-grid" aria-hidden="true" />
          <div className="arm-base" aria-hidden="true" />
          <div className="arm-link link-one" aria-hidden="true"><i /></div>
          <div className="arm-link link-two" aria-hidden="true"><i /></div>
          <div className="arm-gripper" aria-hidden="true"><i /><i /></div>
          <div className="arm-visual-copy">
            <span>ARM KINEMATICS</span>
            <strong>2-LINK / READY</strong>
            <small>逻辑坐标控制 · 下层限位保护</small>
          </div>
          <div className="arm-coordinate x">X</div>
          <div className="arm-coordinate z">Z</div>
        </section>
        <section className="control-panel arm-panel">
          <div className="panel-title">
            <span>2-LINK ARM</span>
            <h3>两连杆机械臂</h3>
          </div>
          <div className="arm-pad">
            <HoldButton onHoldEnd={() => arm("stop", 0)} onHoldStart={() => arm("z", 1)}>
              上升
            </HoldButton>
            <HoldButton onHoldEnd={() => arm("stop", 0)} onHoldStart={() => arm("x", -1)}>
              后缩
            </HoldButton>
            <button onClick={() => arm("stop", 0)} type="button">
              停止
            </button>
            <HoldButton onHoldEnd={() => arm("stop", 0)} onHoldStart={() => arm("x", 1)}>
              前伸
            </HoldButton>
            <HoldButton onHoldEnd={() => arm("stop", 0)} onHoldStart={() => arm("z", -1)}>
              下降
            </HoldButton>
          </div>
          <div className="panel-footnote">按住移动 / 松开即停</div>
        </section>
        <section className="control-panel wrist-panel">
          <div className="panel-title">
            <span>WRIST / GRIPPER</span>
            <h3>腕部与夹爪</h3>
          </div>
          <p>旋转范围 −180°～+180°，每次 10°；上抬仍由实体控制器负责。</p>
          <div className="dual-actions">
            <button
              onClick={() =>
                void window.rescue.invokeCapability({
                  name: "wrist",
                  body: { action: "rotate-step", direction: -1 }
                })
              }
              type="button"
            >
              左旋 10°
            </button>
            <button
              onClick={() =>
                void window.rescue.invokeCapability({
                  name: "wrist",
                  body: { action: "rotate-step", direction: 1 }
                })
              }
              type="button"
            >
              右旋 10°
            </button>
          </div>
          <button
            className="calibration-button"
            onClick={() =>
              void window.rescue.invokeCapability({
                name: "wrist-center",
                body: {}
              })
            }
            type="button"
          >
            将腕部当前位置设为中点
          </button>
          <div className="dual-actions">
            <HoldButton onHoldEnd={() => claw(0)} onHoldStart={() => claw(1)}>
              张开
            </HoldButton>
            <HoldButton onHoldEnd={() => claw(0)} onHoldStart={() => claw(-1)}>
              闭合
            </HoldButton>
          </div>
        </section>
      </div>
    </div>
  );
}
