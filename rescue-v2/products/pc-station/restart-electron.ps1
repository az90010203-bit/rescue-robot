param(
    [Parameter(Mandatory = $true)]
    [int]$CurrentPid,
    [Parameter(Mandatory = $true)]
    [string]$ElectronDirectory,
    [Parameter(Mandatory = $true)]
    [string]$ElectronExecutable,
    [Parameter(Mandatory = $true)]
    [string]$Packaged
)

$ErrorActionPreference = "Stop"
$stationRoot = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$electronRoot = [IO.Path]::GetFullPath($ElectronDirectory)
$agentScript = [IO.Path]::GetFullPath((Join-Path $stationRoot "agent\rescue_agent.py"))
$packagedAgent = [IO.Path]::GetFullPath((Join-Path $stationRoot "agent\rescue-control-agent.exe"))
$logDirectory = if ($Packaged -eq "True") {
    Join-Path $env:LOCALAPPDATA "Rescue V2 Control Station\logs"
}
else {
    Join-Path $stationRoot "logs"
}
$logPath = Join-Path $logDirectory "restart-electron.log"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Write-RestartLog {
    param([string]$Message)
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value (
        "{0:yyyy-MM-dd HH:mm:ss.fff} {1}" -f (Get-Date), $Message
    )
}

Write-RestartLog "Electron restart requested pid=$CurrentPid packaged=$Packaged"
try {
    Invoke-RestMethod `
        -Method Post `
        -Uri "http://127.0.0.1:18400/v2/control/stop" `
        -ContentType "application/json" `
        -Body '{"reason":"electron_restart_helper"}' `
        -TimeoutSec 1 | Out-Null
}
catch {
    Write-RestartLog "Agent stop unavailable; watchdog remains active"
}

Start-Sleep -Milliseconds 350

$agentProcesses = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -like "python*.exe" -and $_.CommandLine -like "*$agentScript*") -or
    ($_.Name -eq "rescue-control-agent.exe" -and $_.ExecutablePath -and
        [IO.Path]::GetFullPath($_.ExecutablePath) -eq $packagedAgent)
}
foreach ($process in $agentProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    Write-RestartLog "stopped Agent pid=$($process.ProcessId)"
}

Stop-Process -Id $CurrentPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if ($Packaged -eq "True") {
    $resolvedExecutable = [IO.Path]::GetFullPath($ElectronExecutable)
    Start-Process -FilePath $resolvedExecutable -WorkingDirectory (Split-Path -Parent $resolvedExecutable)
    Write-RestartLog "started packaged Electron"
    exit 0
}

$pnpm = "C:\Users\47459\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if (-not (Test-Path -LiteralPath $pnpm)) {
    Write-RestartLog "pnpm runtime not found"
    exit 1
}

Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/c", "`"$pnpm`" start") `
    -WorkingDirectory $electronRoot `
    -WindowStyle Hidden
Write-RestartLog "started development Electron"
