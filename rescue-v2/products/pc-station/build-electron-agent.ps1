param(
    [string]$Python = $env:RESCUE_AGENT_PYTHON
)

$ErrorActionPreference = "Stop"
$stationRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$agentScript = [IO.Path]::GetFullPath((Join-Path $stationRoot "agent\rescue_agent.py"))
$distRoot = [IO.Path]::GetFullPath((Join-Path $stationRoot "agent-dist"))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $stationRoot ".build\pyinstaller"))
$pyInstallerDist = [IO.Path]::GetFullPath((Join-Path $buildRoot "dist"))

if ([string]::IsNullOrWhiteSpace($Python)) {
    $platformIoPython = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".platformio\penv\Scripts\python.exe"
    if (Test-Path -LiteralPath $platformIoPython) {
        $Python = $platformIoPython
    }
    else {
        $pythonCommand = Get-Command "python.exe" -ErrorAction SilentlyContinue
        if ($null -ne $pythonCommand) {
            $Python = $pythonCommand.Source
        }
    }
}

foreach ($target in @($distRoot, $buildRoot, $pyInstallerDist)) {
    if (-not $target.StartsWith($stationRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a path outside the PC station: $target"
    }
}

if ([string]::IsNullOrWhiteSpace($Python) -or -not (Test-Path -LiteralPath $Python)) {
    throw "Python runtime was not found: $Python"
}
if (-not (Test-Path -LiteralPath $agentScript)) {
    throw "Control Agent source was not found: $agentScript"
}

& $Python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is required. Install requirements-build.lock.txt into the selected Python runtime."
}

if (Test-Path -LiteralPath $distRoot) {
    Remove-Item -LiteralPath $distRoot -Recurse -Force
}
if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name "rescue-control-agent" `
    --hidden-import "serial" `
    --distpath $pyInstallerDist `
    --workpath $buildRoot `
    --specpath $buildRoot `
    $agentScript

if ($LASTEXITCODE -ne 0) {
    throw "Control Agent packaging failed with exit code $LASTEXITCODE"
}

$builtAgent = Join-Path $pyInstallerDist "rescue-control-agent"
$packagedAgent = Join-Path $distRoot "agent"
Move-Item -LiteralPath $builtAgent -Destination $packagedAgent

$agentExecutable = Join-Path $packagedAgent "rescue-control-agent.exe"
if (-not (Test-Path -LiteralPath $agentExecutable)) {
    throw "Packaged Control Agent was not created: $agentExecutable"
}

Write-Host "Packaged Control Agent: $agentExecutable"
