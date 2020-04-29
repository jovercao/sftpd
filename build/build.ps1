$dir = Split-Path -Parent $PSCommandPath

if (!(test-Path $dir/../dist/cache/)) {
  mkdir $dir/../dist/cache/
}

$pkg = Get-Content $dir/../package.json -Encoding utf8 | ConvertTo-Json
$platforms = @(
  New-Object PSObject @{
    name = 'win64';
    target = 'node10-win-x64';
    suffix = 'windows-x64';
    filename = 'sftp.exe'
  }
)

$platforms | ForEach-Object {
  Write-Host $_;
  $output = "$dir/../dist/cache/$($_.filename)";
  pkg --target $_.target --output $output $dir/../
  7z a "$dir/../dist/sftpd-$($pkg.version)-$($_.suffix).7z" $output
}
