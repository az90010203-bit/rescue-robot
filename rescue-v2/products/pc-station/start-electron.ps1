$ErrorActionPreference = "Stop"

$stationRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$electronRoot = Join-Path $stationRoot "electron"
$pnpm = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $pnpm) {
    $fallback = "C:\Users\47459\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
    if (-not (Test-Path -LiteralPath $fallback)) {
        throw "pnpm was not found. Install pnpm or run corepack enable."
    }
    $pnpmPath = $fallback
}
else {
    $pnpmPath = $pnpm.Source
}

if (-not (Test-Path -LiteralPath (Join-Path $electronRoot "node_modules"))) {
    & $pnpmPath install --dir $electronRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Electron dependency installation failed with exit code $LASTEXITCODE"
    }
}

& $pnpmPath --dir $electronRoot start
exit $LASTEXITCODE
