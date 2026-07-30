import { useEffect, useMemo, useState } from "react";

import type { AgentHealth } from "../shared/contracts";
import type { OperationNotice } from "../shared/bridge";
import { NavIcon } from "./components/NavIcon";
import { CameraPage } from "./pages/CameraPage";
import { CanPage } from "./pages/CanPage";
import { DevicesPage } from "./pages/DevicesPage";
import { DrivePage } from "./pages/DrivePage";
import { ManipulatorPage } from "./pages/ManipulatorPage";
import { SettingsPage } from "./pages/SettingsPage";

type PageId =
  | "drive"
  | "manipulator"
  | "can"
  | "camera"
  | "devices"
  | "settings";

interface NavigationItem {
  readonly id: PageId;
  readonly label: string;
  readonly code: string;
  readonly icon: "arm" | "camera" | "devices" | "drive" | "legs" | "settings";
}

const NAVIGATION: readonly NavigationItem[] = [
  { id: "drive", label: "整机操作", code: "DRV", icon: "drive" },
  { id: "manipulator", label: "机械臂", code: "ARM", icon: "arm" },
  { id: "can", label: "CAN 四腿", code: "LEG", icon: "legs" },
  { id: "camera", label: "主摄像头", code: "CAM", icon: "camera" },
  { id: "devices", label: "设备遥测", code: "SYS", icon: "devices" },
  { id: "settings", label: "设置", code: "CFG", icon: "settings" }
];

/**
 * Rescue V2 Electron operator shell.
 *
 * Child pages are introduced independently so the Qt fallback remains usable
 * throughout the parallel migration.
 */
export function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>("drive");
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [notice, setNotice] = useState<OperationNotice>({
    level: "info",
    message: "正在连接独立控制 Agent"
  });

  useEffect(() => {
    const removeHealth = window.rescue.onHealth((value) => {
      setHealth(value);
      if (value === null) {
        setNotice({
          level: "error",
          message: "控制 Agent 离线"
        });
        return;
      }
      setNotice({
        level: value.ok ? "info" : "warning",
        message: value.ok ? "控制链路在线" : value.lastError ?? "树莓派暂时离线"
      });
    });
    const removeOperation = window.rescue.onOperation(setNotice);
    void window.rescue.getHealth().then((value) => {
      if (value !== null) {
        setHealth(value);
      }
    });
    return () => {
      removeHealth();
      removeOperation();
      void window.rescue.clearMotion();
    };
  }, []);

  const pageLabel = useMemo(
    () => NAVIGATION.find((item) => item.id === page)?.label ?? "",
    [page]
  );

  const selectPage = (nextPage: PageId): void => {
    if (nextPage !== page) {
      void window.rescue.clearMotion();
      setPage(nextPage);
    }
  };

  const activePage = (): React.JSX.Element => {
    switch (page) {
      case "drive":
        return <DrivePage health={health} />;
      case "manipulator":
        return <ManipulatorPage />;
      case "can":
        return <CanPage />;
      case "camera":
        return <CameraPage robotHealth={health} />;
      case "devices":
        return <DevicesPage health={health} />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-mark" aria-label="Rescue V2">
          <div className="brand-monogram">R2</div>
          <div>
            <strong>RESCUE V2</strong>
            <span>OPERATOR CONTROL</span>
          </div>
        </div>
        <nav aria-label="控制站页面">
          {NAVIGATION.map((item) => (
            <button
              aria-label={item.label}
              className={page === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => selectPage(item.id)}
              type="button"
            >
              <NavIcon name={item.icon} />
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <small>{item.code} / 0{NAVIGATION.indexOf(item) + 1}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span>STATION</span>
          <strong>ELECTRON 0.2</strong>
          <small>LOCAL SAFETY CORE</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="command-bar">
          <div className="command-title">
            <div className="eyebrow">MISSION CONTROL / {page.toUpperCase()}</div>
            <h1>{pageLabel}</h1>
          </div>
          <div className="link-overview">
            <div className={health === null ? "link-metric bad" : "link-metric good"}>
              <span>CONTROL AGENT</span>
              <strong>{health === null ? "OFFLINE" : "ONLINE"}</strong>
            </div>
            <div className={health?.pi?.ok ? "link-metric good" : "link-metric bad"}>
              <span>ROBOT LINK</span>
              <strong>{health?.pi?.ok ? "ONLINE" : "OFFLINE"}</strong>
            </div>
          </div>
          <div className="command-actions">
            <button
              className="restart-button"
              onClick={() => void window.rescue.restartSoftware()}
              type="button"
            >
              重启控制软件
            </button>
            <button
              aria-label="整机急停"
              className="emergency-button"
              onClick={() => void window.rescue.stop("electron_emergency_stop")}
              type="button"
            >
              <span>EMERGENCY</span>
              <strong>整机急停</strong>
            </button>
          </div>
        </header>

        <div className={`safety-strip ${health?.armed ? "armed" : "safe"}`}>
          <div className="safety-state">
            <i />
            <span>{health?.armed ? "CONTROL CHANNEL ACTIVE" : "SAFE / STANDBY"}</span>
          </div>
          <div className={`system-notice ${notice.level}`}>
            <span className="pulse-dot" />
            {notice.message}
          </div>
          <span className="safety-hint">SPACE / EMERGENCY STOP</span>
        </div>

        <section className="page-stage" data-page={page}>
          {activePage()}
        </section>
      </main>
    </div>
  );
}
