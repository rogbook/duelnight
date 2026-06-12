# 디지몬 카드 PNG 폴더를 일괄 JPEG(최대 500px, q82)로 변환.
# 사용: powershell -File digimon-convert.ps1 -SrcDir <원본폴더> -OutDir <출력폴더>
param([Parameter(Mandatory=$true)][string]$SrcDir, [Parameter(Mandatory=$true)][string]$OutDir)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$qp = New-Object System.Drawing.Imaging.EncoderParameters(1)
$qp.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)
$maxW = 500
$ok = 0; $fail = 0

Get-ChildItem -Path $SrcDir -File | ForEach-Object {
  $outPath = Join-Path $OutDir ($_.BaseName + ".jpg")
  if (Test-Path $outPath) { $ok++; return }  # 이미 변환됨(재실행 안전)
  try {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    if ($img.Width -gt $maxW) { $nw = $maxW; $nh = [int]($img.Height * $maxW / $img.Width) }
    else { $nw = $img.Width; $nh = $img.Height }
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $bmp.Save($outPath, $enc, $qp)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    $ok++
  } catch {
    $fail++
    Write-Host "변환 실패: $($_.Name) - $_"
  }
}
Write-Host "변환 완료: 성공 $ok, 실패 $fail"
