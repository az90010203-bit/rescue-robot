$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $scriptDir "build"
$gcc = "arm-none-eabi-gcc"
$objcopy = "arm-none-eabi-objcopy"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$gccArgs = @(
  "-mcpu=cortex-m4",
  "-mthumb",
  "-mfpu=fpv4-sp-d16",
  "-mfloat-abi=hard",
  "-Wall",
  "-Wextra",
  "-Os",
  "-ffreestanding",
  "-fdata-sections",
  "-ffunction-sections",
  "-nostdlib",
  "-Wl,--gc-sections",
  "-T",
  (Join-Path $scriptDir "STM32F427IIHx_FLASH.ld"),
  (Join-Path $scriptDir "startup_stm32f427xx.s"),
  (Join-Path $scriptDir "main.c"),
  "-o",
  (Join-Path $buildDir "robomaster_a_controller.elf")
)

& $gcc @gccArgs

& $objcopy -O binary `
  (Join-Path $buildDir "robomaster_a_controller.elf") `
  (Join-Path $buildDir "robomaster_a_controller.bin")

Write-Host "Built $buildDir\robomaster_a_controller.bin"
