# 救援机器人控制台

救援机器人控制台是一个面向救援机器人调试、远程控制和现场测试的本地 Web 工具。当前系统包含 React 控制台、平台运行层、内置插件包、Feetech 舵机总线、TB6618/PWM 电机控制、摄像头云台、机械臂示教、树莓派 SSH 远控、固件刷写助手和本地数据服务。

## 快速运行

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

常用本地服务：

```powershell
cd web
npm.cmd run data-service
npm.cmd run firmware-helper
npm.cmd run pi-helper
```

常用验证：

```powershell
cd web
npm.cmd run build
npm.cmd test
npm.cmd run health
```

## 架构图

<!-- ARCHITECTURE:BEGIN -->
```mermaid
flowchart LR
  Web --> CameraSourcePanel[CameraSourcePanel shared camera viewer]
  Web --> SharedFormatters[shared/formatters.ts]
  Platform --> PanelLayoutCore[panelLayoutCore shared layout helpers]
  PluginUi --> AutoDetectCore[pluginAutoDetect/detectors.ts]
  DataService --> LocalHttpHelper[local-http-helper.mjs JSON loopback]
  FirmwareHelper --> LocalHttpHelper
  PiHelper --> LocalHttpHelper
  User[操作员] --> Web[React 控制台 AppShell]

  subgraph Browser[浏览器本地运行层]
    Web --> AppRuntime[app/* 外壳 / 导航 / 运行时 hooks]
    AppRuntime --> Console[主控台 / 插件 / 组件 / 机器人 / 功能测试 / 设置]
    AppRuntime --> FeaturePanels[features/* 舵机 / 机械臂 / 底盘 / 摄像头 / 树莓派]
    FeaturePanels --> ArmKinematics[armKinematics FK / CCD IK / 自动调参建议]
    AppRuntime --> PluginUi[插件]
    AppRuntime --> ComponentUi[组件]
    AppRuntime --> RobotUi[机器人]
    PluginUi --> CreateWizard[折叠创建向导 / 类型配置确认]
    ComponentUi --> CreateWizard
    RobotUi --> CreateWizard
    RobotUi --> AssemblyCanvas[机器人装配画布 / 可收缩素材栏]
    AssemblyCanvas --> RobotInspector[右侧检查器 / 动作按钮]
    AssemblyCanvas --> ProgramPanel[Blockly 图形化编程 / PC workflow 执行]
    RobotInspector --> CopyFallback[装配页 i18n 兜底 / 结构检查降噪]
    AppRuntime --> I18n[resources.* 多语言资源]
    CopyFallback --> I18n
    Web --> Styles[styles/* 分区样式]
    Web --> Platform[平台运行层 platform/*]
    Platform --> ArchitectureModel[DeviceCatalogItem / PluginInstance / ComponentDefinition / RobotDefinition]
    Platform --> DeviceModel[DeviceDescriptor / StateSnapshot]
    Platform --> Executor[PlatformCommand Executor]
    Platform --> WorkflowRuntime[WorkflowDefinition / RobotProgram DSL]
    Platform --> UiSchema[UiPanelSchema 渲染器]
    Platform --> Plugins[内置插件包 plugins/builtin/*]
    Web --> BrowserMedia[Browser MediaDevices / local camera]
    PluginUi --> DriverLibrary[代码驱动库文件 / driver packages]
    PluginUi --> ServoAdvanced[Feetech 高级配置 / ID 写入 / 逻辑中位]
    Web --> Cache[浏览器缓存 / IndexedDB fallback]
  end

  subgraph ThreeLayer[SQLite 三层资产库]
    Catalog[设备品牌型号目录]
    PluginInstances[插件实例 / 真实小设备]
    Components[组件 / 多插件组合]
    Robots[机器人 / 多组件装配]
    Layouts[可拖动面板布局]
    DriverLibrary --> Catalog
    CreateWizard --> PluginInstances
    CreateWizard --> Components
    CreateWizard --> Robots
    Catalog --> PluginInstances --> Components --> Robots
    Robots --> AssemblyCanvas
    Robots --> Layouts
    Components --> Layouts
  end

  subgraph BuiltinPlugins[插件包]
    Plugins --> ServoPlugin[Feetech Servo]
    Plugins --> MotorPlugin[TB6618 Motor]
    Plugins --> CameraPlugin[Camera Gimbal]
    Plugins --> BrowserCameraPlugin[Browser Camera]
    Plugins --> ArmPlugin[Robot Arm Composite]
    Plugins --> PiPlugin[Raspberry Pi SSH]
    Plugins --> FirmwarePlugin[Local Firmware Helper]
    Plugins --> CorePlugins[核心能力与传输]
  end

  subgraph Hardware[硬件与控制链路]
    ArchitectureModel --> DeviceModel
    Executor --> WebSerial[WebSerial]
    WebSerial --> Feetech[Feetech TTL 总线]
    Feetech --> Servos[STS/SCS 舵机与机械臂]
    ServoAdvanced --> Feetech
    Executor --> Controller[ESP32 / JSON 控制器]
    Controller --> Motors[TB6618 / PWM 电机]
    Controller --> Gimbal[摄像头云台舵机]
  end

  subgraph Helpers[本机辅助服务]
    Web --> DataService[data-service.mjs]
    DataService --> SQLite[(SQLite 项目 / 三层资产 / 遥测)]
    DataService --> ThreeLayer
    Executor --> FirmwareHelper[firmware-helper.mjs]
    FirmwareHelper --> PlatformIO[PlatformIO 编译 / 上传]
    Executor --> PiDiscovery[Pi discovery / USB-C gadget recovery]
    Executor --> PiHelper[pi-helper.mjs]
    PiDiscovery --> PiHelper
    PiDiscovery --> RaspberryPi
    PiHelper --> RaspberryPi[树莓派 SSH / SFTP / 摄像头服务]
    Web --> HealthCheck[health-check.mjs / chunk 与乱码巡检]
  end
```
<!-- ARCHITECTURE:END -->

## Stepwise Merge Refactor Notes

- Camera rendering now goes through `web/src/features/drive/CameraSourcePanel.tsx`, shared by the drive page and console dashboard camera panels.
- Panel layout primitives live in `web/src/platform/panelLayoutCore.ts`; `architecture.ts` re-exports the same API for compatibility.
- Plugin auto-detection hardware scanning lives in `web/src/features/pluginAutoDetect/detectors.ts`; the panel only manages phases, cancellation, rendering, and auto-add.
- Local helper HTTP basics live in `web/scripts/local-http-helper.mjs` and are shared by `data-service.mjs`, `firmware-helper.mjs`, and `pi-helper.mjs`.
- Display formatting helpers live in `web/src/shared/formatters.ts` for dashboard, platform state, and app metric formatting.
- Three-layer workspace primitives and pure helpers now live in `web/src/components/ArchitectureWorkspacePrimitives.tsx` and `web/src/components/architectureWorkspaceUtils.ts`.
- Production TypeScript builds exclude `src/**/*.test.ts(x)`; Vitest remains responsible for test files.

## 主要模块

- `web/src/App.tsx`：极薄入口，直接导出 `web/src/app/AppShell.tsx`。
- `web/src/app/*`：控制台外壳、导航、持久化、串口/平台/反馈运行时和工作区组合逻辑。
- `web/src/features/*`：按功能拆分的舵机、机械臂、底盘、摄像头、电机、树莓派和平台面板；机械臂面板包含 2D FK/IK 与调参建议 UI。
- `web/src/components/ThreeLayerWorkspace.tsx`：插件库、组件库和机器人运行面板，由架构页按需加载，按入口 `layer` 分别渲染；创建插件、组件和机器人使用折叠创建向导，收起态变为 56px 左侧 rail，让右侧库和运行面板横向扩展；插件页按设备类型、品牌、代码库顺序创建真实插件实例，插件库使用格子布局并支持删除未占用实例，点开舵机/电机实例会显示从功能测试迁入的单实例调试面板；Feetech 舵机详情包含限位、复位、逻辑中位和带确认的物理 ID 写入。
- `web/src/features/robotAssembly/RobotAssemblyWorkspace.tsx`：机器人装配画布、素材栏、右侧检查器、动作按钮和 Blockly 图形化程序面板；素材栏可一键收缩为组件、插件、硬件图标栏，收起后画布优先扩展，右侧检查器保持稳定宽度；可见文案通过 `robotText` 兜底，避免 `robotAssembly.*` key 泄漏，并将结构检查里的内部 ID 和英文校验消息压缩成更适合操作员阅读的提示；图形化程序保存为 `RobotProgram`，首版固定在 PC/浏览器端编译成 `WorkflowDefinition` 后执行。
- `web/src/platform/*`：平台模型、命令、执行器、事件、插件注册、设备拓扑、状态快照和 UI schema helper。
- `web/src/platform/architecture.ts`：三层架构纯模型，包括驱动库派生、设备目录、插件实例、组件、机器人、面板布局、唯一占用校验和旧驱动 profile 兼容桥。
- `web/src/plugins/builtin/*`：内置能力、驱动、传输和设备面板 schema，包括舵机、电机、摄像头、机械臂、树莓派和固件刷写。
- `web/src/lib/*`：稳定业务能力，包括协议、存储、底盘混控、舵机平滑、安全保护、2D 机械臂运动学/调参、树莓派远控、固件助手和数据服务客户端。
- `web/src/styles/*`：按页面和能力拆分的样式入口，由 `web/src/App.css` 聚合。
- `web/scripts/*`：本地数据服务、三层资产 SQLite schema、固件刷写助手、树莓派 SSH helper 和文档同步检查。
- `web/scripts/health-check.mjs`：只读项目健康检查，汇总最大源码文件、`any` 使用量、测试声明数、构建 chunk 体积、UTF-8 文档状态和常见乱码片段。
- `firmware/`：ESP32/PlatformIO 固件，负责 JSON 控制器、PWM 电机和 Feetech 总线桥接能力。
- `docs/`：协议和设备接线说明。

## 平台化约定

- UI 层优先通过 `PlatformCommand` 表达设备动作，`dispatchPlatformCommand` 统一进入 `executePlatformCommand`。
- 图形化编程首版通过 Blockly 编辑受控 DSL，保存到机器人 `config.programs`，运行时只派发 `PlatformCommand`；树莓派离线 runner 和 A 板固件下放留作后续阶段。
- 插件实例是物理设备实例，组件和机器人装配必须通过 SQLite 数据服务保存；浏览器 IndexedDB 只作为旧配置 fallback。
- 插件、组件、机器人和功能测试的通用平台控制区优先使用 `UiPanelSchema` 渲染，三层平级页面会按插件能力自动生成并保存可拖动面板。
- 设备能力通过 `DeviceDescriptor`、`DeviceStateSnapshot`、`UiPanelSchema` 和内置插件描述。
- 保持现有硬件协议、串口波特率、Feetech 二进制帧、ESP32 JSON 命令和项目数据结构兼容；物理舵机 ID 写入只在 Feetech 直连总线下作为高级操作执行，逻辑中位保存到插件/机械臂配置。

## 文档同步规则

任何代码、脚本、固件、配置或协议变更，都必须同步更新本 README，并更新上方 Mermaid 架构图。`npm.cmd test` 会运行 `web/scripts/check-doc-sync.mjs`；当发现非 README 的 tracked 变更但 README 或架构图区块未同步变化时会失败。

## 硬件默认链路

- 舵机测试：默认现场链路为 Web UI -> 树莓派 `pi-servo-serial-bridge.service` -> `/dev/serial0 @ 115200` -> Bus Servo Driver HAT(A) ESP32 transparent firmware -> Feetech STS/SCS 舵机；浏览器 WebSerial -> USB/TTL Feetech 总线适配器仍保留为 `1000000 baud` 直连调试路径。
- RoboMaster A 板测试：Web UI -> 树莓派 `a-board-serial-bridge.service` -> `/dev/ttyAMA5 @ 115200` -> A 板 `PD5/PD6 USART2`；树莓派物理引脚固定为 `30 GND / 32 TXD5 / 33 RXD5`。
- 控制器模式：Chrome/Edge WebSerial -> ESP32 JSON 控制器，默认 `115200 baud`。
- 数据服务：`127.0.0.1:17351`，默认 SQLite 路径为 `%USERPROFILE%\.rescue-robot\rescue-robot.sqlite`。
- 固件刷写：本机 `firmware-helper.mjs` 调用 PlatformIO 编译和上传。
- 树莓派 helper：本机 `pi-helper.mjs` 通过 SSH/SFTP 执行上传、运行和摄像头相关命令；树莓派远程面板可手动保存完整远程配置，避免每次重新输入；无屏找回优先扫描 `rescue-pi.local`、`10.12.194.1` 和 `10.43.0.1`，并可通过 SSH 配置 USB-C gadget 直连。

## Dual Camera Notes

- Main camera source: `camera:main`, `/dev/video0`, port `8080`, `http://<pi-host>:8080/stream`.
- Second camera plugin: `camera:secondary`, `/dev/video1`, port `8081`, `http://<pi-host>:8081/stream`, video-only.
- The main control page can switch the active source or use the dual layout to display both streams together. Gimbal movement stays bound to `camera:main`.

## Local Browser Camera Notes

- Computer camera plugin: `builtin.browser-camera`, driver `driver.browser-camera`, transport `transport.browser-media`.
- The plugin page preview uses `navigator.mediaDevices.getUserMedia()` and browser camera permissions.
- Local browser camera preview stays in the plugin/three-layer workspace and does not add a main-control video source.
