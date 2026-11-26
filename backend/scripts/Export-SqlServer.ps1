param([string]$Server='localhost',[string]$Database='MMET_BI_OLTP',[string]$OutputPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if(-not $OutputPath){$OutputPath=Join-Path $projectRoot '.local/oltp-export.json'}
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
$null=New-Item -ItemType Directory -Force (Split-Path $OutputPath -Parent)
$schema=Get-Content (Join-Path $projectRoot 'sql_postgres/01_oltp.sql') -Raw
$tables=[regex]::Matches($schema,'CREATE TABLE dbo\.(\w+)') | ForEach-Object {$_.Groups[1].Value}
$columns=$tables | ForEach-Object {"JSON_QUERY(COALESCE((SELECT * FROM dbo.[$_] FOR JSON PATH, INCLUDE_NULL_VALUES),N'[]')) AS [$_]"}
$query='SET NOCOUNT ON; SELECT '+($columns -join ',')+' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;'
$tempQuery=Join-Path $projectRoot '.local/export-source.sql'
$query | Set-Content -LiteralPath $tempQuery -Encoding utf8
& sqlcmd -S $Server -E -d $Database -i $tempQuery -y 0 -w 65535 -f 65001 -b -o $OutputPath
if($LASTEXITCODE -ne 0){throw 'Falló la exportación SQL Server.'}
$raw=Get-Content -LiteralPath $OutputPath -Raw -Encoding utf8
$raw=$raw.Substring($raw.IndexOf('{')).Trim() -replace '[\r\n]',''
$data=$raw | ConvertFrom-Json -AsHashtable
foreach($table in $tables){if(-not $data.ContainsKey($table)){$data[$table]=@()}}
[IO.File]::WriteAllText($OutputPath,($data | ConvertTo-Json -Depth 20 -Compress),[Text.UTF8Encoding]::new($false))
Write-Output 'Exportación local preparada. Contiene cuentas y hashes: no subir este archivo a Git.'
