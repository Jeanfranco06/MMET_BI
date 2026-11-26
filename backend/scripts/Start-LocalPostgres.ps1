param([switch]$Stop)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$profilePath=Join-Path $root '.local/postgres-local.json'
if(-not(Test-Path -LiteralPath $profilePath)){throw 'No existe un perfil local. Use su instalación PostgreSQL o Docker Compose; consulte README.md.'}
$profile=Get-Content -LiteralPath $profilePath -Raw|ConvertFrom-Json
$ctl=Join-Path $root ($profile.bin+'/pg_ctl.exe')
$data=Join-Path $root $profile.data
if($Stop){& $ctl stop -D $data -m fast;exit $LASTEXITCODE}
& $ctl status -D $data
if($LASTEXITCODE -ne 0){& $ctl start -D $data -l (Join-Path $root '.local/postgres17.log') -o "-p $($profile.port) -h 127.0.0.1";exit $LASTEXITCODE}
