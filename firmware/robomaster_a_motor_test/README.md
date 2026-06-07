# RoboMaster Type A TB6612 Motor Test

Open-loop motor test firmware for one GMR DC motor through a TB6612 driver.

## Wiring

| Type A pin | TB6612 / motor board |
| --- | --- |
| PD12 | PWM |
| PA2 | AIN1 |
| PA3 | AIN2 |
| PI5 | STBY |
| PA0 | E1A, optional for later encoder tests |
| PA1 | E1B, optional for later encoder tests |
| PGND | GND |

The motor driver board must be powered by its own motor supply and must share
ground with the Type A board.

## Behavior

After reset:

1. Waits for about 2 seconds with the motor stopped.
2. Runs forward at 15 percent PWM for about 2 seconds.
3. Stops for about 1 second.
4. Runs reverse at 15 percent PWM for about 2 seconds.
5. Stops for about 2 seconds and repeats.

Green LED means forward. Red LED means reverse. Both LEDs off means stopped.

Build on Windows:

```powershell
.\baremetal\build.ps1
```

Output:

```text
baremetal/build/robomaster_a_motor_test.bin
baremetal/build/robomaster_a_motor_test.elf
```
