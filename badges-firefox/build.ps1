$ErrorActionPreference = 'Stop'
$badgeSource = Join-Path $PSScriptRoot 'extension'
$badgeOutput = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $badgeOutput -Force | Out-Null
& web-ext lint --source-dir $badgeSource --output text
if ($LASTEXITCODE -ne 0) { throw 'La validation Mozilla a échoué.' }
& web-ext build --source-dir $badgeSource --artifacts-dir $badgeOutput --filename 'badges-affichapp-1.2.1.zip' --overwrite-dest
if ($LASTEXITCODE -ne 0) { throw 'La création du paquet a échoué.' }
