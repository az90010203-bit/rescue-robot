# RoboMaster Type A Motor Controller

Bare-metal STM32F427 firmware for the RoboMaster Type A board motor/CAN
controller. It exposes eight PWM motor channels (`M1`-`M8`), reads quadrature
encoders through GPIO software counting, and exchanges semantic commands over
USART2.

## Default PWM Motor Wiring

| Channel | Wheel | PWM | IN1 | IN2 | STBY | Encoder A | Encoder B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Mecanum FR | PD14 / TIM4_CH3 | PB1 | PC0 | PI0 | PC1 | PA4 |
| M2 | Mecanum BR | PD13 / TIM4_CH2 | PF0 | PE4 | PI0 | PE12 | PB0 |
| M3 | Mecanum FL | PD15 / TIM4_CH4 | PI5 | PI6 | PH12 | PI7 | PI2 |
| M4 | Mecanum BL | PH11 / TIM5_CH2 | PC3 | PC4 | PH12 | PC5 | PA5 |
| M5 | Left Track | PH10 / TIM5_CH1 | PA0 | PA1 | PH12 | PA2 | PA3 |
| M6 | Right Track | PD12 / TIM4_CH1 | PF1 | PE5 | PI0 | PE6 | PC2 |
| M7 | Configurable | motor.config required | motor.config required | motor.config required | optional | optional | optional |
| M8 | Configurable | motor.config required | motor.config required | motor.config required | optional | optional | optional |

`motor.config` applies the `pins` object at runtime, so saved web-console
pin mappings are reflected on the MCU before motion commands. PWM pins must be
real Type A timer outputs: `PD12`-`PD15` on TIM4, or `PA0`-`PA3`,
`PH10`-`PH12`, `PI0` on TIM5.

UART bridge wiring:

| Type A pin | Function | Target |
| --- | --- | --- |
| PD5 / USART2_TX | UART TX | Raspberry Pi GPIO13/RXD5, physical pin 33 |
| PD6 / USART2_RX | UART RX | Raspberry Pi GPIO12/TXD5, physical pin 32 |
| PGND | Ground | Raspberry Pi GND, physical pin 30, TB6612 GND |

The A board, Raspberry Pi, and motor driver must share ground. Encoder signals
must be 3.3 V logic or level shifted before they touch the Type A board GPIOs.

On Raspberry Pi 4/400/CM4, enable this UART with `dtoverlay=uart5` in
`/boot/firmware/config.txt`. The Pi-side bridge uses `/dev/ttyAMA5`.

## Protocol

UART is `115200 8N1`. Commands and responses are one JSON object per line.
Supported command types:

- `debug.set`
- `motor.config`
- `motor.target`
- `motor.stop`
- `motor.read`
- `mecanum.config`
- `mecanum.target`
- `mecanum.stop`
- `can.config`
- `can_servo.config`
- `can_servo.move`
- `can_servo.read`
- `can_servo.set_current`
- `can_servo.pid`
- `can_servo.set_id`
- `can_servo.save_center`
- `can_servo.factory_reset`
- `can.robomaster.current`
- `can.robomaster.stop`
- `imu.read`

The normal PC/Pi runtime path uses the semantic commands above. The Pi bridge
forwards one JSON line per intent over UART; this firmware owns motor closed
loop, mecanum wheel mixing, ASMG-MD CAN frame construction/parsing, and
latest-wins motion scheduling. Motion targets (`motor.target`,
`mecanum.target`, `can_servo.move`) keep only the newest pending target.
`motor.stop` and `mecanum.stop` clear pending motion immediately.

`motor.feedback` returns:

- `channel`
- `commandedSpeedPercent`
- `dutyPercent`
- `direction`
- `stopMode`
- `encoderTicks`
- `pulseHz`
- `encoderA`
- `encoderB`
- `encoderDelta`
- `encoderDirection`
- `sampleMs`

`speedRpm` uses the default 13 PPR x4 estimate unless `motor.config` supplies
`encoderTicksPerRev`. Closed loop is on by default for channels with both
encoder pins configured and disabled for channels without encoder feedback.
Use `motor.config` or `mecanum.config` only when changing wiring or tuning;
do not resend configuration during live drive control.

`imu.read` initializes the board IMU on first use, then returns one
`imu.feedback` sample from the MPU6500/MPU6600 over SPI5 and IST8310 over the
MPU AUX I2C bridge:

```json
{"type":"imu.read","seq":20}
```

The response includes `ready`, `mpuWhoAmI`, `istWhoAmI`, raw accelerometer,
gyroscope, magnetometer, `tempRaw`, `sampleMs`, and optional `error`. The web
console performs roll/pitch/yaw math and magnetometer calibration.

## CAN1 / ASMG-MD CAN Servo Path

CAN1 is initialized on `PD0/CAN1_RX` and `PD1/CAN1_TX`. The firmware switches
to the Type A board's 12 MHz HSE clock before enabling USART/CAN, because CAN
is much less tolerant of the internal RC clock than UART.

Default CAN bitrate is `250 kbit/s` for ASMG-MD CAN servos, and
`can_servo.config` can change the board CAN bitrate at runtime:

```json
{"type":"can_servo.config","seq":1,"bitrateKbps":250}
```

The ASMG-MD protocol uses extended data frames with host ID `0x18EF0201`
inside firmware. The PC no longer sends raw `can.send` ASMG-MD frames in the
normal path.

Read the current servo ID. Only use the broadcast-style ID read on a single
servo bus:

```json
{"type":"can_servo.read","seq":11,"request":"id"}
```

Read position and current for servo ID `0`:

```json
{"type":"can_servo.read","seq":12,"id":0,"request":"position_current"}
```

Command servo ID `0` to hold position `0x0E86` at the slowest speed
`0x0500`:

```json
{"type":"can_servo.move","seq":13,"id":0,"position":3718,"speed":1280}
```

Responses use `can_servo.feedback` with parsed semantic fields and the optional
`rawDataHex` for diagnostics. Legacy `can.send`/`can.read` handlers may remain
compiled for hidden bring-up diagnostics, but they are not the public PC/Web
path.

Small RoboMaster motor/GM6020-style current command. `controlId` is decimal:
`512` is `0x200`, `511` is `0x1FF`, and `767` is `0x2FF`. `slot` is the
1-based 16-bit field inside the 8-byte frame.

```json
{"type":"can.robomaster.current","seq":3,"controlId":512,"slot":1,"current":300,"durationMs":300}
```

Stop frame:

```json
{"type":"can.robomaster.stop","seq":4,"controlId":512}
```

## Build

```powershell
cd firmware\robomaster_a_controller\baremetal
.\build.ps1
```

Output:

```text
baremetal/build/robomaster_a_controller.bin
baremetal/build/robomaster_a_controller.elf
```

## Flash From Raspberry Pi ST-Link

```bash
openocd -f interface/stlink.cfg -f target/stm32f4x.cfg \
  -c "program /tmp/robomaster_a_controller.bin 0x08000000 verify reset exit"
```

ST-Link is only for flashing/debugging. Runtime motor feedback uses USART2
through the Raspberry Pi UART bridge.
