# RoboMaster Type A Motor Controller

Bare-metal STM32F427 firmware for the RoboMaster Type A board motor test.
It controls one TB6612 channel, reads a quadrature encoder, and exchanges
newline-delimited JSON over USART2.

## Fixed Wiring

| Type A pin | Function | Target |
| --- | --- | --- |
| PD12 / TIM4_CH1 | PWM | TB6612 PWM |
| PA2 | Direction | TB6612 AIN1 |
| PA3 | Direction | TB6612 AIN2 |
| PI5 | Standby | TB6612 STBY |
| PA0 / TIM2_CH1 | Encoder A | Encoder E1A |
| PA1 / TIM2_CH2 | Encoder B | Encoder E1B |
| PD5 / USART2_TX | UART TX | Raspberry Pi GPIO13/RXD5, physical pin 33 |
| PD6 / USART2_RX | UART RX | Raspberry Pi GPIO12/TXD5, physical pin 32 |
| PGND | Ground | Raspberry Pi GND, physical pin 30, TB6612 GND |

The A board, Raspberry Pi, and motor driver must share ground. Encoder E1A/E1B
must be 3.3 V logic or level shifted before they touch PA0/PA1.

On Raspberry Pi 4/400/CM4, enable this UART with `dtoverlay=uart5` in
`/boot/firmware/config.txt`. The Pi-side bridge uses `/dev/ttyAMA5`.

## Protocol

UART is `115200 8N1`. Commands and responses are one JSON object per line.
Supported command types:

- `debug.set`
- `motor.config`
- `motor.set`
- `motor.stop`
- `motor.read`
- `can.config`
- `can.send`
- `can.read`
- `can.robomaster.current`
- `can.robomaster.stop`
- `imu.read`

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

`speedRpm` is intentionally omitted until the GMR encoder PPR is known.

`imu.read` initializes the board IMU on first use, then returns one
`imu.feedback` sample from the MPU6500/MPU6600 over SPI5 and IST8310 over the
MPU AUX I2C bridge:

```json
{"type":"imu.read","seq":20}
```

The response includes `ready`, `mpuWhoAmI`, `istWhoAmI`, raw accelerometer,
gyroscope, magnetometer, `tempRaw`, `sampleMs`, and optional `error`. The web
console performs roll/pitch/yaw math and magnetometer calibration.

## CAN1 Test Path

CAN1 is initialized on `PD0/CAN1_RX` and `PD1/CAN1_TX`. The firmware switches
to the Type A board's 12 MHz HSE clock before enabling USART/CAN, because CAN
is much less tolerant of the internal RC clock than UART.

Default CAN bitrate is `1 Mbps`, and `can.config` can change it at runtime:

```json
{"type":"can.config","seq":1,"bitrateKbps":250}
```

Frames are sent in normal mode, so a successful `can.feedback.ok=true` means
the bus acknowledged the frame. If wiring, power, termination, or bitrate is
wrong, the command reports a CAN transmit error or timeout.

Raw standard-ID frame:

```json
{"type":"can.send","seq":1,"id":512,"dlc":8,"b0":0,"b1":0,"b2":0,"b3":0,"b4":0,"b5":0,"b6":0,"b7":0}
```

Raw extended-ID frame:

```json
{"type":"can.send","seq":2,"id":418316801,"extended":true,"dlc":8,"b0":254,"b1":253,"b2":0,"b3":0,"b4":0,"b5":0,"b6":0,"b7":0}
```

Drain received frames:

```json
{"type":"can.read","seq":2}
```

## ASMG-MD CAN Servo Test

The ASMG-MD protocol uses 250 kbit/s extended data frames with host ID
`0x18EF0201` (`418316801` decimal). Multi-byte fields are high byte first.

Configure 250 kbit/s:

```json
{"type":"can.config","seq":10,"bitrateKbps":250}
```

Read the current servo ID. Only use the broadcast-style ID read on a single
servo bus:

```json
{"type":"can.send","seq":11,"id":418316801,"extended":true,"dlc":8,"b0":254,"b1":253,"b2":0,"b3":0,"b4":0,"b5":0,"b6":0,"b7":0}
```

Read position and current for servo ID `0`:

```json
{"type":"can.send","seq":12,"id":418316801,"extended":true,"dlc":8,"b0":0,"b1":7,"b2":0,"b3":0,"b4":0,"b5":0,"b6":0,"b7":0}
```

Command servo ID `0` to hold position `0x0E86` at the slowest speed
`0x0500`:

```json
{"type":"can.send","seq":13,"id":418316801,"extended":true,"dlc":8,"b0":0,"b1":1,"b2":14,"b3":134,"b4":5,"b5":0,"b6":0,"b7":0}
```

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
