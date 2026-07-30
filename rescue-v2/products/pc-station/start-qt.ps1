$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\47459\.platformio\penv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Rescue V2 Python runtime was not found: $python"
}

$agentPort = Get-NetTCPConnection -LocalPort 18400 -State Listen -ErrorAction SilentlyContinue
if (-not $agentPort) {
    $logDirectory = Join-Path $root "logs"
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    Start-Process `
        -FilePath $python `
        -ArgumentList @((Join-Path $root "agent\rescue_agent.py"), "--pi-host", "192.168.55.131") `
        -RedirectStandardOutput (Join-Path $logDirectory "control-agent.out.log") `
        -RedirectStandardError (Join-Path $logDirectory "control-agent.err.log") `
        -WindowStyle Hidden
    Start-Sleep -Milliseconds 500
}

& $python (Join-Path $root "qt\rescue_console.py")
