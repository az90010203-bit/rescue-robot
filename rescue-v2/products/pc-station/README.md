# PC station

The PC station ships as one versioned product with two processes and two
parallel operator interfaces:

- `rescue-control-agent` owns controller discovery, the Pi session, command
  sequencing, and the local safety heartbeat.
- `rescue-console-ui` is the current default Qt client.
- `electron/` is the new React + TypeScript + Electron client undergoing
  parallel acceptance. A UI crash must not terminate the control Agent; an IPC
  heartbeat timeout still causes a stop.

Only logical capability handles and normalized operator intent cross this
boundary. Hardware addresses, pins, actuator identifiers, and bus topology are
not valid PC concepts.

## React + Electron operator console

Double-click `start-electron.cmd` to run the parallel console in development.
It starts or reconnects to the independent Agent, but QT remains the default
fallback until Electron completes physical acceptance.

The Electron console includes:

- whole-robot mecanum and tracked drive with the three existing speed modes;
- manipulator, wrist, gripper, four CAN legs, gimbal and feedback controls;
- 1080p30 H.264 MSE video, WebRTC field audio and camera telemetry;
- controller, Pi, A-board, IMU, Feetech and Agent diagnostics;
- a main-process 100 ms heartbeat, 20 Hz latest-intent motion dispatch and
  high-priority emergency stop;
- automatic motion release on blur, minimize, navigation, close or renderer
  failure.

For a distributable Windows build, install
`requirements-build.lock.txt` into the selected Python build environment, then
run `pnpm make` in `electron/`. The resulting package embeds an independent
Control Agent and does not require Python on the operator computer.

### Default-switch criteria

Electron becomes the default entry only after all of the following pass:

- non-motion Pi, camera, audio, controller, A-board, IMU and servo connectivity;
- raised-platform motion tests for both chassis modes, all three speed levels,
  manipulator, CAN legs, gimbal, input release and emergency stop;
- 30 minutes of 1080p30 video without accumulated latency and two hours of
  control-station runtime without heartbeat buildup or sustained memory growth;
- renderer/main/Agent failure tests proving watchdog stop and no automatic
  motion after recovery;
- a trusted Windows signature on the application and Squirrel installer
  (tracked in `az90010203-bit/rescue-robot#7`).

After the switch, QT remains available for one complete acceptance cycle as
the rollback entry and receives no new features.

## Qt 6 operator console

The current production console is `qt/rescue_console.py`, pinned to PySide6 6.11.1.
Double-click `start-qt.cmd`. It starts the independent control Agent if needed
and then opens the native Qt window.

The window contains:

- a single low-latency 1080p30 H.264 UGREEN driving-camera view with live audio and health;
- whole-robot drive, tracked drive, arm, and emergency stop;
- an `L` control matching the ESP32PLUS semantics: short press stops motion
  before alternating between mecanum and tracked input panels; a 700 ms hold
  cycles `CRUISE MODE`, `TURBO MODE`, and `HYPER MODE` at 30/50/70% for
  mecanum and 30/60/100% for tracked drive;
- a one-click PC software restart in the Qt control bar. It requests a whole
  robot stop, relies on the Pi watchdog if the Agent is unavailable, then
  restarts only the PC Agent and Qt through an external helper;
- two-link arm, ID13 wrist lift, bounded left/right wrist rotation, and gripper
  controls;
- CAN actuator group jog and feedback requests;
- A-board, Feetech, controller, IMU, Pi, and Agent diagnostics;
- fixed watchdog and physical limit visibility.

## Browser bring-up console

The dependency-free page in `web/` is retained only as a bring-up tool. Double
click `start-control.cmd`, then use:

- **解锁底盘** to obtain a fresh lease;
- hold **运动使能** or left Shift while controlling;
- `W/S` for forward/back, `A/D` for strafe, and `Q/E` for rotation;
- Space or **急停并锁定** for immediate braking.

Releasing the deadman, changing host, hiding the page, or losing window focus
stops and releases the lease. The operator must explicitly arm again.
