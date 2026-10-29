Add-Type -AssemblyName System.Drawing
$public = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
foreach ($size in @(180,192,512)) {
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#985cff'))
  $g.ScaleTransform(($size/64),($size/64))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White,4)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLines($pen,[System.Drawing.PointF[]]@((New-Object System.Drawing.PointF(16,29)),(New-Object System.Drawing.PointF(32,15)),(New-Object System.Drawing.PointF(48,29)),(New-Object System.Drawing.PointF(48,47)),(New-Object System.Drawing.PointF(16,47)),(New-Object System.Drawing.PointF(16,29))))
  $g.DrawLines($pen,[System.Drawing.PointF[]]@((New-Object System.Drawing.PointF(27,47)),(New-Object System.Drawing.PointF(27,34)),(New-Object System.Drawing.PointF(37,34)),(New-Object System.Drawing.PointF(37,47))))
  $name = if ($size -eq 180) {'apple-touch-icon.png'} else {"icon-$size.png"}
  $bitmap.Save((Join-Path $public $name),[System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose();$g.Dispose();$bitmap.Dispose()
}
