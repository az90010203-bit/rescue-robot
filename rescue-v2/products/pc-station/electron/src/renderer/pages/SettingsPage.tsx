import { PageHeading } from "../components/PageHeading";

/** Read-only deployment and safety boundary summary. */
export function SettingsPage(): React.JSX.Element {
  return (
    <div className="page settings-page">
      <PageHeading
        description="部署参数由各产品自己拥有；控制站只保存操作偏好"
        kicker="CONFIGURATION / 06"
        title="连接与安全边界"
      />
      <section className="settings-ledger">
        <div>
          <span>LOCAL CONTROL AGENT</span>
          <strong>127.0.0.1:18400</strong>
        </div>
        <div>
          <span>UI MOTION SCHEDULER</span>
          <strong>20 Hz / 50 ms</strong>
        </div>
        <div>
          <span>UI HEARTBEAT</span>
          <strong>10 Hz / 100 ms</strong>
        </div>
        <div>
          <span>PI WATCHDOG</span>
          <strong>150 ms</strong>
        </div>
        <div>
          <span>CAMERA NODE</span>
          <strong>192.168.55.131:8080</strong>
        </div>
        <div>
          <span>PHYSICAL LIMIT</span>
          <strong>100% · 档位约束</strong>
        </div>
      </section>
      <aside className="boundary-note">
        硬件引脚、CAN 外设、串口路径和舵机 ID 不进入 React
        渲染进程。窗口失焦、最小化或渲染进程退出都会清除运动状态并触发停车。
      </aside>
    </div>
  );
}
