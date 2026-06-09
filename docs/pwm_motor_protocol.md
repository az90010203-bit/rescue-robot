# PWM 电机调试系统协议 v1

## 1. 系统链路

```text
Browser WebSerial UI
  -> newline-delimited JSON over USB serial
  -> board-side interpreter
  -> local channel-to-pin mapping
  -> PWM + IN1/IN2 H-bridge driver
  -> DC motor
```

这一部分只定义 PC 和下位机解释程序之间的通用协议。`M1`、`M2` 这类逻辑端口不等于电脑上的 COM 串口；它们表示开发板解释程序里的电机通道。TB6618 按每路 `PWM + IN1 + IN2` 控制；Arduino、STM32、RoboMaster A 板等平台可以用 `motor.config` 从 UI 接收映射，也可以把映射写死在固件里。

TB6618 模块按用户手头板子处理：没有单独 `VCC` 时，不要把 Arduino 5V 当成驱动板电源接入。驱动板使用外接 12V 给电机侧供电，Arduino 只接控制信号，并且 Arduino GND 必须与 TB6618/12V 电源 GND 共地。

推荐 Arduino Uno/Nano 首版接线：

| 通道 | TB6618 PWM | TB6618 IN1 | TB6618 IN2 | TB6618 EN/STBY |
| --- | --- | --- | --- | --- |
| M1 | D5 | D4 | D7 | D10 |
| M2 | D6 | D8 | D9 | D10 |

供电：

- TB6618 `12V / VM / VIN / +` 接外接 12V 正极。
- TB6618 `GND / -` 接 12V 负极。
- Arduino `GND` 接 TB6618 `GND`。
- Arduino 不接 TB6618 的 12V 正极。

## 2. PC -> MCU JSON 协议

每条消息是一行 UTF-8 JSON，以 `\n` 结束。所有请求都带 `type` 和 `seq`。固件应忽略未知字段，以便后续扩展。

### `debug.set`

进入或退出某个调试模块。`module` 是可选字段，旧版舵机固件可以继续只读取 `enabled`。

```json
{"type":"debug.set","seq":1,"enabled":true,"module":"motor"}
```

### `motor.set`

设置一个逻辑端口的开环 PWM 速度。

```json
{
  "type": "motor.set",
  "seq": 2,
  "channel": "M1",
  "speedPercent": -45,
  "stopMode": "coast"
}
```

字段约束：

- `channel`：逻辑端口，推荐使用 `M1`、`M2`、`M3` 这样的名字；上位机会规范化为大写。
- `speedPercent`：`-100..100`。正数为正转，负数为反转，`0` 为停止。
- `stopMode`：可选，`coast` 或 `brake`，默认 `coast`。

### `motor.config`

设置一个逻辑电机端口在当前开发板上的实际接线。这个命令解决“`M1` 到底接到 Arduino 哪个引脚”的问题。

```json
{
  "type": "motor.config",
  "seq": 3,
  "channel": "M1",
  "driver": "tb6618",
  "pins": {
    "pwm": "D5",
    "in1": "D4",
    "in2": "D7",
    "enable": "D10",
    "sensor": "D2"
  }
}
```

字段约束：

- `driver`：首版固定为 `tb6618`，可省略，解释程序按 TB6618 处理。
- `pins.pwm`：必填，PWM 输出端，例如 Arduino `D5`、STM32 `PA8`。
- `pins.in1`：必填，方向输入 1，例如 Arduino `D4`。
- `pins.in2`：必填，方向输入 2，例如 Arduino `D7`。
- `pins.enable`：可选，`EN/STBY` 端。TB6618 模块如果没有这个脚可以省略。
- `pins.sensor`：可选，GMR 或霍尔测速输入端。首版只保存/回传，不做闭环控制。

### `motor.stop`

停止单个端口，或停止所有端口。

```json
{"type":"motor.stop","seq":4,"channel":"M1","stopMode":"brake"}
```

```json
{"type":"motor.stop","seq":5,"all":true,"stopMode":"coast"}
```

### `motor.read`

读取电机反馈。首版可只返回命令状态；GMR 或霍尔测速接好后再填充速度字段。

```json
{"type":"motor.read","seq":6,"channel":"M1"}
```

## 3. MCU -> PC JSON 响应

### ACK

```json
{"type":"ack","seq":2,"command":"motor.set","message":"ok"}
```

### Error

```json
{"type":"error","seq":2,"command":"motor.set","code":"invalid_speed","message":"speedPercent must be -100..100"}
```

### Feedback

```json
{
  "type": "motor.feedback",
  "seq": 6,
  "channel": "M1",
  "commandedSpeedPercent": -45,
  "dutyPercent": 45,
  "direction": "reverse",
  "stopMode": "coast",
  "speedRpm": 120.5,
  "pulseHz": 36.2,
  "encoderTicks": 1024
}
```

`speedRpm`、`pulseHz`、`encoderTicks` 都是可选字段。没有测速传感器时不要伪造速度，省略这些字段即可。

## 4. 通用解释程序结构

核心思想是把协议解释和板卡输出分离：协议层只处理 JSON、校验和 ACK；板卡层只实现端口映射和 PWM/IN1/IN2 输出。

```cpp
struct MotorState {
  const char* channel;
  float commandedSpeedPercent;
  float dutyPercent;
  const char* direction;
  const char* stopMode;
};

class MotorDriver {
 public:
  bool configure(const char* channel, const MotorPins& pins);
  bool apply(const char* channel, float speedPercent, const char* stopMode);
  bool stop(const char* channel, const char* stopMode);
  void stopAll(const char* stopMode);
  bool read(const char* channel, MotorState& state);
};
```

不同开发板只替换 `MotorDriver` 内部实现：

- `motor.config` 更新 `channel -> pins/timer` 映射，例如 `M1 -> PWM D5 + IN1 D4 + IN2 D7`。
- 如果固件不允许运行时配置端口，可以忽略 `motor.config` 并返回 `unsupported_command`，但 UI 仍会保留本地接线备注。
- `speedPercent > 0` 时 `IN1=HIGH, IN2=LOW` 并输出 `abs(speedPercent)` 占空比。
- `speedPercent < 0` 时 `IN1=LOW, IN2=HIGH` 并输出 `abs(speedPercent)` 占空比。
- `speedPercent == 0` 或 `motor.stop` 时按 `stopMode` 选择滑行或刹车：`coast` 为双低，`brake` 为双高。
- GMR/霍尔测速接入后，在 `read()` 中更新 `speedRpm`、`pulseHz` 或 `encoderTicks`。

## 5. Arduino 风格伪代码

```cpp
bool MotorDriver::apply(const char* channel, float speedPercent, const char* stopMode) {
  MotorPins pins;
  if (!lookupPins(channel, pins)) {
    return false;
  }

  float duty = constrain(abs(speedPercent), 0.0f, 100.0f);
  if (speedPercent > 0) {
    digitalWrite(pins.in1Pin, HIGH);
    digitalWrite(pins.in2Pin, LOW);
  } else if (speedPercent < 0) {
    digitalWrite(pins.in1Pin, LOW);
    digitalWrite(pins.in2Pin, HIGH);
  } else {
    return stop(channel, stopMode);
  }

  analogWrite(pins.pwmPin, dutyToPwmTicks(duty));
  rememberState(channel, speedPercent, duty, speedPercent > 0 ? "forward" : "reverse", stopMode);
  return true;
}
```

STM32 HAL、RoboMaster A 板或其他平台也保持同样的 `apply()` 语义，只把 `digitalWrite/analogWrite` 换成对应的 GPIO 和定时器 PWM API。

## 6. RoboMaster Type A quadrature encoder path

For the current RoboMaster Type A four-wheel WHEELTEC G513XL setup, ST-Link is
used only for flashing and debugging. Runtime feedback goes through the
Raspberry Pi GPIO UART and the HTTP serial bridge. The four PWM outputs use
TIM5 channels on `PA0-PA3`; encoder inputs are opened as GPIO pull-up inputs
and counted in firmware.

Fixed Type A motor wiring:

| Channel | Wheel | PWM | IN1 | IN2 | STBY | Encoder A | Encoder B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | A 左前轮 | PA0 | PB0 | PE12 | PD12 | PE4 | PF0 |
| M2 | B 左后轮 | PA1 | PC2 | PE6 | PD12 | PE5 | PF1 |
| M3 | C 右后轮 | PA2 | PA4 | PC1 | PD12 | PC0 | PB1 |
| M4 | D 右前轮 | PA3 | PA5 | PC5 | PD12 | PC4 | PC3 |

Fixed Type A bridge wiring:

| Type A pin | Role | Connects to |
| --- | --- | --- |
| PD5 / USART2_TX | UART TX | Raspberry Pi GPIO13/RXD5, physical pin 33 |
| PD6 / USART2_RX | UART RX | Raspberry Pi GPIO12/TXD5, physical pin 32 |
| PGND | Ground | Raspberry Pi GND, physical pin 30 |

The board-side `motor.config` command may include encoder pins alongside the
legacy single `sensor` pin:

```json
{
  "type": "motor.config",
  "seq": 3,
  "channel": "M1",
  "driver": "tb6618",
  "pins": {
    "pwm": "PA0",
    "in1": "PB0",
    "in2": "PE12",
    "enable": "PD12",
    "sensor": "PE4",
    "encoderA": "PE4",
    "encoderB": "PF0"
  }
}
```

`motor.feedback` uses the existing optional fields:

- `encoderTicks`: signed quadrature counter value for the configured channel.
- `pulseHz`: absolute encoder tick delta per second since the previous feedback
  sample.
- `encoderA` / `encoderB`: raw configured encoder input levels, `0` or `1`.
- `encoderDelta`: signed tick change since the previous feedback sample.
- `encoderDirection`: `forward`, `reverse`, or `stopped`, derived from
  `encoderDelta`.
- `sampleMs`: A board millisecond uptime at the feedback sample.
- `speedRpm`: estimated motor-shaft RPM. The current Type A firmware defaults
  to a 13 PPR Hall encoder with quadrature x4 counting, so
  `encoderTicksPerRev = 52`. `motor.config.encoderTicksPerRev` may override
  this calibration value.
- `closedLoop`: the current Type A firmware enables closed-loop control by
  default on the four-channel GPIO encoder path. Override it with
  `motor.config` or `mecanum.config` only for debugging or saved calibration,
  not during live drive control.

Type A semantic runtime commands:

- Use `motor.target` for a single motor target. It has the same key fields as
  `motor.set`, but it enters the firmware latest-wins motion scheduler.
- Use `mecanum.target` for chassis velocity:
  `{ seq, forward, strafe, turn, speedLimitPercent, stopMode }`. The firmware
  maps `frontLeft=M1`, `rearLeft=M2`, `rearRight=M3`, `frontRight=M4`, mixes
  the four wheel targets, and applies closed-loop control internally.
- Use `mecanum.stop` or `motor.stop` for safety stops. These clear pending
  motion targets before applying the stop.
- Live PC/Web code must not expand one mecanum action into repeated
  `motor.config + motor.set` messages.

Raspberry Pi bridge:

- The servo HAT owns the primary Pi UART on physical pins 6/8/10 and
  `/dev/serial0`.
- The Type A board therefore uses UART5 on physical pins 30/32/33:
  `pin 30 GND`, `pin 32 GPIO12/TXD5 -> Type A PD6/RX`, and
  `pin 33 GPIO13/RXD5 <- Type A PD5/TX`.
- Enable Pi UART5 with `dtoverlay=uart5` in `/boot/firmware/config.txt`, then
  reboot. The Pi image initializer `pi-image/install-rescue-pi.sh` appends this
  line and installs `a-board-serial-bridge.service`; the web upgrade/repair
  action is a manual SSH fallback.
- Run `web/local-services/a-board-serial-bridge.py` on the Pi; the image
  initializer installs it under `/opt/rescue-robot/bridges/`, enables
  `Restart=always`, and listens on `http://0.0.0.0:17353`.
- `GET /health` reports the UART bridge state and includes optional
  `{ service, version, queueDepth, inFlight, motionPending, latestMotionSeq, droppedMotionCount }`
  metadata. `ok: false` with
  service metadata means the daemon is reachable but `/dev/ttyAMA5` is not
  available yet.
- `POST /command` writes one JSON command to `/dev/ttyAMA5 @ 115200` and
  returns the A board JSON response messages. The normal runtime path sends
  one semantic command per intent, such as `mecanum.target` or `motor.target`.

Pinout reference: [RoboMaster Type A board user manual, page 31](https://cdn-hz.robomaster.com/tem/RoboMaster%E5%BC%80%E5%8F%91%E7%89%88%E7%94%A8%E6%88%B7%E6%89%8B%E5%86%8C.pdf#page=31).
