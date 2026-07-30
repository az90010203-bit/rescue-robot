import { useEffect, useMemo, useState } from "react";

import type { AgentHealth } from "../shared/contracts";
import type { OperationNotice } from "../shared/bridge";
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
}

const NAVIGATION: readonly NavigationItem[] = [
  { id: "drive", label: "整机操作", code: "DRV" },
  { id: "manipulator", label: "机械臂", code: "ARM" },
  { id: "can", label: "CAN 四腿", code: "LEG" },
  { id: "camera", label: "主摄像头", code: "CAM" },
  { id: "devices", label: "设备遥测", code: "SYS" },
  { id: "settings", label: "设置", code: "CFG" }
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
          <span>R</span>
          <strong>V2</strong>
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
              <span>{item.code}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="rail-version">ELECTRON 0.1</div>
      </aside>

      <main className="workspace">
        <header className="command-bar">
          <div>
            <div className="eyebrow">RESCUE ROBOT / OPERATOR STATION</div>
            <h1>{pageLabel}</h1>
          </div>
          <div className={`system-notice ${notice.level}`}>
            <span className="pulse-dot" />
            {notice.message}
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
              className="emergency-button"
              onClick={() => void window.rescue.stop("electron_emergency_stop")}
              type="button"
            >
              整机急停
            </button>
          </div>
        </header>

        <div className="life-line" aria-hidden="true">
          <i />
          <span>{health?.armed ? "CONTROL CHANNEL ACTIVE" : "SAFE / STANDBY"}</span>
          <i />
        </div>

        <section className="page-stage" data-page={page}>
          {activePage()}
        </section>
      </main>
    </div>
  );
}
