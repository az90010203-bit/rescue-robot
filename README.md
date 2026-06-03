# 救援机器人舵机调试系统 v1

这是救援机器人远程控制软件的第一块：飞特 STS/SCS TTL 串行总线舵机调试系统。

舵机测试现在默认走 PC 直连飞特总线，和飞特调试软件的工作方式一致：

```text
Chrome/Edge WebSerial UI -> USB/TTL Feetech bus adapter -> Feetech STS/SCS servo
```

电机、摄像头等后续模块仍可通过 ESP32 控制器扩展。

## 目录

- `web/`：Vite + React + TypeScript 调试界面。
- `firmware/`：PlatformIO + Arduino ESP32 固件。
- `docs/servo_protocol.md`：PC-ESP32 JSON 协议和 ESP32-飞特二进制协议。
- `docs/camera_stream_gimbal.md`：树莓派 MJPEG 视频流与 ESP32 云台舵机控制方案。

## 前端运行

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

打开 Chrome 或 Edge 中显示的本地地址。进入舵机模块时，点击串口连接按钮选择飞特总线转接器，例如本机验证通过的 CH343 `COM6`，舵机总线波特率为 `1000000`。

## 固件编译

```powershell
cd firmware
& "C:\Users\47459\.platformio\penv\Scripts\pio.exe" run -e esp32dev
```

ESP32 固件仍保留给后续控制器模式使用。当前舵机测试不需要先烧 ESP32。

默认设置：

- USB 串口：`115200`
- 飞特总线 UART：`1000000`
- ESP32 UART1 RX：GPIO 18
- ESP32 UART1 TX：GPIO 19

实际接线请使用 TTL 半双工总线转接板，舵机单独供电并与 ESP32 共地。

舵机调试界面支持两种模式，默认舵机为实际验证通过的 `ID22`：

- `位置角度`：写 `Goal Position/Goal Speed`，用于普通舵机角度控制。
- `轮模式速度`：先写 `ACC`，再写 `Goal Speed`，等价于 `SMS_STS::WriteSpe()`，适合 ST3215/STS 的恒速轮模式，例如 ID21、ID23 差速云台。

## 测试

```powershell
cd web
npm.cmd test
npm.cmd run build
```

## Local SQLite data service

Run this in a separate terminal before opening the web console when you want durable project storage:

```powershell
cd web
npm.cmd run data-service
```

The service listens on `127.0.0.1:17351` and stores data in `%USERPROFILE%\.rescue-robot\rescue-robot.sqlite`.
Set `RESCUE_ROBOT_DB_PATH` to use another SQLite file. If the service is offline, the web console falls back to the browser cache in read-only mode and shows `DB OFFLINE`.
