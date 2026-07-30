$ErrorActionPreference = "Stop"

$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$python = "C:\Users\47459\.platformio\penv\Scripts\python.exe"
$launcher = [IO.Path]::GetFullPath((Join-Path $root "launch_qt.py"))
$agentScript = [IO.Path]::GetFullPath((Join-Path $root "agent\rescue_agent.py"))
$qtScript = [IO.Path]::GetFullPath((Join-Path $root "qt\rescue_console.py"))
$logDirectory = Join-Path $root "logs"
$logPath = Join-Path $logDirectory "restart-control.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Write-RestartLog {
    param([string]$Message)
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value (
        "{0:yyyy-MM-dd HH:mm:ss.fff} {1}" -f (Get-Date), $Message
    )
}

Write-RestartLog "restart requested"

try {
    Invoke-RestMethod `
        -Method Post `
        -Uri "http://127.0.0.1:18400/v2/control/stop" `
        -ContentType "application/json" `
        -Body '{"reason":"ui_software_restart"}' `
        -TimeoutSec 1 | Out-Null
    Write-RestartLog "control stop accepted"
}
catch {
    Write-RestartLog "control stop unavailable; Pi watchdog will stop motion: $($_.Exception.Message)"
}

Start-Sleep -Milliseconds 350

$targets = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID `
        -and $_.Name -like "python*.exe" `
        -and (
            $_.CommandLine -like "*$agentScript*" `
                -or $_.CommandLine -like "*$qtScript*"
        )
}

foreach ($target in $targets) {
    Write-RestartLog "stopping pid=$($target.ProcessId) name=$($target.Name)"
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500

if (-not (Test-Path -LiteralPath $python)) {
    Write-RestartLog "restart failed: Python runtime not found at $python"
    exit 1
}
if (-not (Test-Path -LiteralPath $launcher)) {
    Write-RestartLog "restart failed: launcher not found at $launcher"
    exit 1
}

Start-Process `
    -FilePath $python `
    -ArgumentList @($launcher) `
    -WorkingDirectory $root `
    -WindowStyle Hidden
Write-RestartLog "launcher started"
