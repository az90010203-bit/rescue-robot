# 舵机调试系统协议 v1

## 1. 系统链路

```text
Browser WebSerial UI
  -> Feetech STS/SCS serial bus packet over USB serial
  -> USB/TTL half-duplex bus adapter
  -> Servo
```

第一版目标是舵机调试，不包含步态生成器。舵机测试模块现在默认 PC 直连飞特总线，已验证 `COM6 @ 1000000` 可直接控制 `ID22`。

## 2. PC -> 舵机直连协议

舵机模块直接发送飞特二进制帧：

```text
FF FF | ID | Length | Instruction | Params... | Checksum
```

常用指令：

- `PING=0x01`
- `READ=0x02`
- `WRITE=0x03`

校验：

```text
Checksum = ~(ID + Length + Instruction/Status + Params...) & 0xFF
```

## 3. 兼容 JSON 协议

ESP32 控制器模式仍可使用换行分隔 JSON。每条消息是一行 UTF-8 JSON，以 `\n` 结束。所有请求都带 `type` 和 `seq`。

### `debug.set`

进入或退出舵机调试模式。

```json
{"type":"debug.set","seq":1,"enabled":true}
```

### `servo.move`

在普通舵机位置模式下，控制一个或多个舵机到目标角度。

```json
{
  "type": "servo.move",
  "seq": 2,
  "sync": false,
  "targets": [
    {"id": 1, "name": "J1", "angleDeg": 90, "speedRaw": 800, "acc": 30}
  ]
}
```

字段约束：

- `id`：`0-253`，`254/0xFE` 只用于飞特广播，不作为普通舵机。
- `angleDeg`：`0-360`。
- `speedRaw`：`0-4095`，UI 仅辅助显示约 `speedRaw * 0.732 rpm`。
- `acc`：可选，`0-254`。存在时 ESP32 从 `0x29` 连写 7 字节；不存在时从 `0x2A` 连写 6 字节。

### `servo.speed`

在 STS/SMS 轮模式下控制舵机恒速旋转，等价于 Feetech `SMS_STS::WriteSpe()` 的写法。第一版 UI 会在发送前让 ESP32 自动切到 wheel mode。

```json
{
  "type": "servo.speed",
  "seq": 6,
  "setupWheelMode": true,
  "targets": [
    {"id": 21, "name": "J21", "speedRaw": 300, "acc": 50}
  ]
}
```

字段约束：

- `speedRaw`：默认 `-1000..1000`，正负号表示旋转方向。固件用 STS/SMS 的 15 位符号格式编码负数。
- `acc`：可选，默认 `50`，范围 `0-254`。
- 写法跟 Arduino `SCServo` 库的 `SMS_STS::WriteSpe()` 对齐：先写 `ACC=41/0x29` 一个字节，再写 `Goal Speed=46/0x2E` 两个字节。

示例：ID21 以 `speedRaw=300`、`acc=50` 恒速旋转。

```text
FF FF 15 04 03 29 32 88
FF FF 15 05 03 2E 2C 01 87
```

示例：ID21 以 `speedRaw=-300`、`acc=50` 反向恒速旋转。

```text
FF FF 15 04 03 29 32 88
FF FF 15 05 03 2E 2C 81 07
```

### `servo.mode`

手动切换 STS/SMS 模式。

```json
{"type":"servo.mode","seq":7,"id":21,"mode":"wheel"}
```

`mode` 可为 `wheel` 或 `servo`。固件执行顺序为关扭矩、写 `MODE=33/0x21`、开扭矩。

### `servo.ping`

检测舵机是否有响应。

```json
{"type":"servo.ping","seq":3,"id":1}
```

### `servo.read`

读取基础反馈。

```json
{"type":"servo.read","seq":4,"id":1}
```

反馈字段来自飞特 STS/SCS SRAM：

- `positionRaw`：`56-57`
- `speedRaw`：`58-59`
- `loadRaw`：`60-61`
- `voltageRaw`：`62`
- `temperatureC`：`63`
- `moving`：`66`
- `currentRaw`：`69-70`

### `servo.torque`

开关扭矩。

```json
{"type":"servo.torque","seq":5,"id":1,"enabled":true}
```

写入地址 `40`，`1` 为开启，`0` 为关闭。

## 4. ESP32 -> PC JSON 响应

### ACK

```json
{"type":"ack","seq":2,"command":"servo.move","message":"ok"}
```

### Error

```json
{"type":"error","seq":2,"command":"servo.move","code":"invalid_angle","message":"angleDeg must be 0-360"}
```

### Feedback

```json
{
  "type": "servo.feedback",
  "seq": 4,
  "id": 1,
  "positionRaw": 1024,
  "speedRaw": 0,
  "loadRaw": 0,
  "voltageRaw": 74,
  "temperatureC": 32,
  "moving": false,
  "currentRaw": 0
}
```

### Log

```json
{"type":"log","seq":0,"level":"info","message":"servo debug firmware ready"}
```

## 5. 飞特 STS/SCS 二进制协议

控制器到舵机：

```text
FF FF | ID | Length | Instruction | Params... | Checksum
```

舵机到控制器：

```text
FF FF | ID | Length | Status | Params... | Checksum
```

规则：

- `Length = 参数数量 + 2`
- `Checksum = ~(ID + Length + Instruction/Status + Params...) & 0xFF`
- 常用指令：`PING=0x01`、`READ=0x02`、`WRITE=0x03`、`SYNC_WRITE=0x83`
- 广播 ID：`0xFE`

位置控制寄存器：

| 名称 | 地址 |
| --- | ---: |
| Torque Enable | 40 / `0x28` |
| Mode | 33 / `0x21` |
| ACC | 41 / `0x29` |
| Goal Position | 42 / `0x2A` |
| Goal Time | 44 / `0x2C` |
| Goal Speed | 46 / `0x2E` |

示例：ID 1 转到 `2048`，时间 `0`，速度 `1000`。

```text
FF FF 01 09 03 2A 00 08 00 00 E8 03 D5
```

参考资料：

- Feetech communication protocol manual: https://files.seeedstudio.com/wiki/robotics/Actuator/feetech/Communication_Protocol_Manual.pdf
- Feetech FTServo Arduino register definitions: https://github.com/ftservo/FTServo_Arduino
- Feetech URT tutorial: https://www.feetechrc.com/Data/feetechrc/upload/file/20201127/start%20%20tutorial201015.pdf

## 6. Raspberry Pi Servo HAT bridge

The current robot wiring reserves the Raspberry Pi primary UART for the
Waveshare Bus Servo Driver HAT(A):

| Pi physical pin | GPIO / role | Servo HAT role |
| --- | --- | --- |
| 6 | GND | Power ground |
| 8 | GPIO14 / TXD0 / `/dev/serial0` TX | PI TX |
| 10 | GPIO15 / RXD0 / `/dev/serial0` RX | PI RX |

Runtime path:

```text
Web UI
  -> Pi servo HTTP bridge http://<pi-host>:17354
  -> /dev/serial0 @ 115200 baud
  -> Bus Servo Driver HAT(A) in ESP32 transparent transmission mode
  -> Feetech STS/SCS servo bus
```

The bridge script is `web/scripts/pi-servo-serial-bridge.py`. The web
"Install/Start Pi Servo Bridge" action uploads it to the Pi and installs
`pi-servo-serial-bridge.service` with `Restart=always`.

The Waveshare HAT must be running its ESP32 transparent transmission firmware
for raw Feetech frames to pass between the Pi UART and the servo bus. If
`GET /health` is `ok: true` but `POST /frame` returns no bytes for servo pings,
check the HAT mode/firmware first, then servo power, servo ID, bus connector
orientation, and shared ground.

Bridge endpoints:

- `GET /health` returns `{ ok, serialPort, baudRate }`.
- `POST /frame` accepts `{ frame: number[], waitMs?: number }`, writes the raw
  Feetech binary frame to `/dev/serial0`, then returns received bytes and a
  parsed status packet when available.

Important chain split:

- Servo HAT: Pi pins `6/8/10`, `/dev/serial0`, HTTP port `17354`, Pi UART
  baud `115200` for the Waveshare ESP32 transparent firmware. Browser
  WebSerial direct Feetech adapters still use `1000000`.
- RoboMaster Type A: Pi pins `30/32/33`, `/dev/ttyAMA5`, HTTP port `17353`,
  baud `115200`.

The Pi servo bridge install command enables `enable_uart=1` and stops the Linux
serial console on `/dev/serial0`. If an older A board service was still bound to
`/dev/serial0`, the install command disables that legacy service so the servo
bus owns pins 8/10 cleanly.

Hardware reference: https://www.waveshare.com/wiki/Bus_Servo_Driver_HAT_%28A%29
