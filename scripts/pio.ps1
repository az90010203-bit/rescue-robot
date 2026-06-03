param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $PioArgs
)

$root = Split-Path -Parent $PSScriptRoot
$pio = Join-Path $root ".platformio-venv\Scripts\pio.exe"

if (-not (Test-Path $pio)) {
  Write-Error "PlatformIO is not installed. Expected: $pio"
  exit 1
}

& $pio @PioArgs
exit $LASTEXITCODE
