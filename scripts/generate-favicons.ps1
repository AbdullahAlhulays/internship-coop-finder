Add-Type -AssemblyName System.Drawing

$publicPath = Join-Path $PSScriptRoot '..\public'
$sourcePath = Join-Path $publicPath 'fursati-icon-512.png'
$source = [System.Drawing.Image]::FromFile($sourcePath)

function New-IconPng([int]$size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($source, 0, 0, $size, $size)
  $graphics.Dispose()

  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return $stream.ToArray()
}

try {
  [System.IO.File]::WriteAllBytes((Join-Path $publicPath 'favicon-48.png'), (New-IconPng 48))
  [System.IO.File]::WriteAllBytes((Join-Path $publicPath 'apple-touch-icon.png'), (New-IconPng 180))

  $sizes = @(16, 32, 48)
  $images = @($sizes | ForEach-Object { New-IconPng $_ })
  $iconPath = Join-Path $publicPath 'favicon.ico'
  $file = [System.IO.File]::Create($iconPath)
  $writer = [System.IO.BinaryWriter]::new($file)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
      $writer.Write([byte]$sizes[$index])
      $writer.Write([byte]$sizes[$index])
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$images[$index].Length)
      $writer.Write([uint32]$offset)
      $offset += $images[$index].Length
    }
    foreach ($png in $images) { $writer.Write([byte[]]$png) }
  } finally {
    $writer.Dispose()
  }
} finally {
  $source.Dispose()
}
