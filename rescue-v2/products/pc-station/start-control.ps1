$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCandidates = @(
    "C:\Users\47459\.platformio\penv\Scripts\python.exe",
    "python.exe"
)
$python = $pythonCandidates | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
if (-not $python) {
    throw "Python was not found."
}

$url = "http://127.0.0.1:18080"
Start-Process $url
& $python -m http.server 18080 --bind 127.0.0.1 --directory (Join-Path $root "web")
