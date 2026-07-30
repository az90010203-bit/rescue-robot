$ErrorActionPreference = "Stop"

$stationRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$electronRoot = [IO.Path]::GetFullPath((Join-Path $stationRoot "electron"))
$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$forgeOutput = [IO.Path]::GetFullPath((Join-Path $systemTemp "rescue-v2-electron-forge"))
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $electronRoot "artifacts"))

if (-not $forgeOutput.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean Forge output outside the system temporary directory: $forgeOutput"
}
if (-not $artifactRoot.StartsWith($electronRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace artifacts outside the Electron project: $artifactRoot"
}

if (Test-Path -LiteralPath $forgeOutput) {
    Remove-Item -LiteralPath $forgeOutput -Recurse -Force
}
if (Test-Path -LiteralPath $artifactRoot) {
    Remove-Item -LiteralPath $artifactRoot -Recurse -Force
}

$pnpm = Get-Command "pnpm.cmd" -ErrorAction Stop
$env:RESCUE_ELECTRON_OUT_DIR = $forgeOutput
try {
    & $pnpm.Source --dir $electronRoot exec electron-forge make
    if ($LASTEXITCODE -ne 0) {
        throw "Electron Forge make failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:RESCUE_ELECTRON_OUT_DIR -ErrorAction SilentlyContinue
}

$makeOutput = Join-Path $forgeOutput "make"
if (-not (Test-Path -LiteralPath $makeOutput)) {
    throw "Electron Forge did not create distributables: $makeOutput"
}

Copy-Item -LiteralPath $makeOutput -Destination $artifactRoot -Recurse
Write-Host "Electron distributables copied to: $artifactRoot"
