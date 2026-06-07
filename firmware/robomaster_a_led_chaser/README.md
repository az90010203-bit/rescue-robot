# RoboMaster Type A LED Chaser

Minimal STM32 HAL bring-up firmware for the RoboMaster Development Board Type A.

The Type A board uses an STM32F427IIH6. The controllable onboard LEDs are active-low:

| Label | GPIO |
| --- | --- |
| A | PG8 |
| B | PG7 |
| C | PG6 |
| D | PG5 |
| E | PG4 |
| F | PG3 |
| G | PG2 |
| H | PG1 |
| Green | PF14 |
| Red | PE11 |

Use `main.c` as the application file in an STM32CubeIDE/CubeMX project for
`STM32F427IIHx`, or paste the user logic into DJI's official Type A example.

The `baremetal/` folder is a self-contained version that does not require a
CubeMX project. Build it on Windows with:

```powershell
.\baremetal\build.ps1
```

The output is:

```text
baremetal/build/robomaster_a_led_chaser.bin
baremetal/build/robomaster_a_led_chaser.elf
```

Flash options:

- ST-Link/J-Link over SWD is recommended.
- USB DFU also works if the board is placed in DFU mode.

SWD wiring:

| ST-Link | Type A SWD |
| --- | --- |
| GND | G |
| SWCLK | SWCLK |
| SWDIO | SIDIO / SWDIO |
| 3.3V / VTref | + |

Do not connect 5V to the SWD `+` pin.

If ST-Link is attached to a Raspberry Pi, copy the `.bin` to the Pi and flash:

```bash
sudo apt-get update
sudo apt-get install -y stlink-tools
st-info --probe
st-flash write /tmp/robomaster_a_led_chaser.bin 0x08000000
```

If the Type A board is attached by USB in DFU mode:

```bash
sudo apt-get update
sudo apt-get install -y dfu-util
dfu-util -l
dfu-util -a 0 -s 0x08000000:leave -D /tmp/robomaster_a_led_chaser.bin
```
