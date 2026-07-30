import type { AgentHealth } from "../../shared/contracts";
import { PageHeading } from "../components/PageHeading";
import { StatusCard } from "../components/StatusCard";

interface DevicesPageProps {
  readonly health: AgentHealth | null;
}

/** Product-level connectivity and telemetry diagnostics. */
export function DevicesPage({ health }: DevicesPageProps): React.JSX.Element {
  const pi = health?.pi;
  const telemetry = pi?.lastTelemetry;
  const controller = health?.controller;
  const feetech = pi?.feetech;
  return (
    <div className="page devices-page">
      <PageHeading
        description="按产品边界显示状态；此处不暴露串口路径、引脚或底层总线地址"
        kicker="SYSTEMS / 05"
        title="设备与遥测"
      />
      <div className="status-grid three">
        <StatusCard
          label="PC AGENT"
          state={health?.ok ? "good" : "bad"}
          value={health?.service ?? "离线"}
        />
        <StatusCard
          label="树莓派协调器"
          state={pi?.ok ? "good" : "bad"}
          value={pi?.service ?? "离线"}
        />
        <StatusCard
          label="ROBOMASTER A"
          state={pi?.serialOpen ? "good" : "bad"}
          value={pi?.serialOpen ? "串口在线" : "串口离线"}
        />
        <StatusCard
          detail={controller?.frameAgeMs == null ? undefined : `${controller.frameAgeMs} ms`}
          label="ESP32PLUS"
          state={controller?.connected ? "good" : "warning"}
          value={controller?.connected ? "在线" : controller?.lastError ?? "未连接"}
        />
        <StatusCard
          label="飞特舵机节点"
          state={feetech?.serialOpen ? "good" : "warning"}
          value={feetech?.serialOpen ? "串口在线" : "串口离线"}
        />
        <StatusCard
          label="IMU / A板遥测"
          state={telemetry?.type ? "good" : "neutral"}
          value={telemetry?.type ?? "等待数据"}
        />
      </div>
      <div className="telemetry-actions">
        <button
          onClick={() =>
            void window.rescue.invokeCapability({
              name: "imu",
              body: { action: "read" }
            })
          }
          type="button"
        >
          读取 IMU
        </button>
        <button
          onClick={() =>
            void window.rescue.invokeCapability({
              name: "feetech",
              body: { action: "read" }
            })
          }
          type="button"
        >
          读取飞特舵机
        </button>
      </div>
      <pre className="telemetry-raw">{JSON.stringify(health, null, 2)}</pre>
    </div>
  );
}
