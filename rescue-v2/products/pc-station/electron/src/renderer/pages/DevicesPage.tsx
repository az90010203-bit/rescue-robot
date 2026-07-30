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
          state={health === null ? "bad" : "good"}
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
      <div className="devices-layout">
        <section className="system-topology">
          <div className="topology-heading">
            <span>PRODUCT TOPOLOGY</span>
            <strong>控制链路拓扑</strong>
          </div>
          <div className="topology-flow">
            <article className={health === null ? "bad" : "good"}>
              <span>01 / LOCAL</span>
              <strong>PC CONTROL AGENT</strong>
              <small>127.0.0.1:18400</small>
            </article>
            <i />
            <article className={pi?.ok ? "good" : "bad"}>
              <span>02 / COORDINATOR</span>
              <strong>RASPBERRY PI</strong>
              <small>192.168.55.131</small>
            </article>
            <i />
            <div className="topology-branches">
              <article className={pi?.serialOpen ? "good" : "bad"}>
                <span>03A / MOTION</span>
                <strong>ROBOMASTER A</strong>
                <small>CAN · IMU · MOTOR</small>
              </article>
              <article className={feetech?.serialOpen ? "good" : "bad"}>
                <span>03B / SERVO</span>
                <strong>FEETECH NODE</strong>
                <small>ARM · GIMBAL</small>
              </article>
            </div>
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
        </section>
        <section className="raw-panel">
          <div className="topology-heading">
            <span>RAW TELEMETRY</span>
            <strong>诊断数据</strong>
          </div>
          <pre className="telemetry-raw">{JSON.stringify(health, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}
