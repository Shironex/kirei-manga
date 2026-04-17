# Build a static, minimal OpenCV for the bubble-detector addon (Windows / PowerShell 5.1+).
# Idempotent: re-running with the cache populated short-circuits download and configure.
# Outputs vendor\opencv-install\ and writes vendor\opencv-env.ps1 with the env vars
# binding.gyp expects (OPENCV_INCLUDE_DIR / OPENCV_LIB_DIR / OPENCV_3RDPARTY_DIR).

$ErrorActionPreference = 'Stop'

$OpenCvVersion = '4.11.0'
$OpenCvSha256  = '9a7c11f924eff5f8d8070e297b322ee68b9227e003fd600d4b8122198091665f'
$OpenCvUrl     = "https://github.com/opencv/opencv/archive/refs/tags/$OpenCvVersion.tar.gz"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AddonDir   = Resolve-Path (Join-Path $ScriptDir '..') | Select-Object -ExpandProperty Path
$VendorDir  = Join-Path $AddonDir 'vendor'
$SrcDir     = Join-Path $VendorDir 'opencv-src'
$BuildDir   = Join-Path $VendorDir 'opencv-build'
$InstallDir = Join-Path $VendorDir 'opencv-install'
$Tarball    = Join-Path $VendorDir "opencv-$OpenCvVersion.tar.gz"
$EnvFile    = Join-Path $VendorDir 'opencv-env.ps1'

if (-not (Test-Path $VendorDir)) {
  New-Item -ItemType Directory -Path $VendorDir | Out-Null
}

if ($OpenCvSha256 -eq 'OPENCV_SHA256_TODO') {
  throw "OPENCV_SHA256 is a TODO placeholder - refusing to download. Pin the verified SHA256 of opencv-$OpenCvVersion.tar.gz first."
}

function Test-Sha256 {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [string] $Expected
  )
  if (-not (Test-Path $Path)) { return $false }
  $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
  return ($actual -eq $Expected.ToLowerInvariant())
}

# 1. Download + verify (skip if cached tarball still matches).
if (Test-Sha256 -Path $Tarball -Expected $OpenCvSha256) {
  Write-Host "==> Using cached tarball $Tarball"
} else {
  Write-Host "==> Downloading $OpenCvUrl"
  # curl.exe ships with Windows 10 1803+; fall back to Invoke-WebRequest if absent.
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($null -ne $curl) {
    & curl.exe -fL --retry 3 -o $Tarball $OpenCvUrl
    if ($LASTEXITCODE -ne 0) { throw "curl.exe failed (exit $LASTEXITCODE) downloading $OpenCvUrl" }
  } else {
    $progressPreferenceOld = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
      Invoke-WebRequest -Uri $OpenCvUrl -OutFile $Tarball -UseBasicParsing
    } finally {
      $ProgressPreference = $progressPreferenceOld
    }
  }
  Write-Host '==> Verifying SHA256'
  if (-not (Test-Sha256 -Path $Tarball -Expected $OpenCvSha256)) {
    throw "SHA256 mismatch for $Tarball"
  }
}

# 2. Extract (skip if already extracted). Expand-Archive can't do .tar.gz; rely on bsdtar (`tar.exe`).
if (-not (Test-Path $SrcDir)) {
  Write-Host "==> Extracting to $SrcDir"
  $extractedDir = Join-Path $VendorDir "opencv-$OpenCvVersion"
  if (Test-Path $extractedDir) { Remove-Item -Recurse -Force $extractedDir }
  & tar.exe -xzf $Tarball -C $VendorDir
  if ($LASTEXITCODE -ne 0) { throw "tar.exe failed (exit $LASTEXITCODE) extracting $Tarball" }
  Move-Item -Path $extractedDir -Destination $SrcDir
}

# 3. Configure (skip if CMakeCache.txt is newer than this script).
$NeedConfigure = $true
$CacheFile = Join-Path $BuildDir 'CMakeCache.txt'
if (Test-Path $CacheFile) {
  $cacheWritten = (Get-Item $CacheFile).LastWriteTimeUtc
  $scriptWritten = (Get-Item $MyInvocation.MyCommand.Path).LastWriteTimeUtc
  if ($cacheWritten -gt $scriptWritten) {
    $NeedConfigure = $false
  }
}

if ($NeedConfigure) {
  Write-Host "==> Configuring (cmake) into $BuildDir"
  if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
  }

  $CMakeArgs = @(
    '-S', $SrcDir,
    '-B', $BuildDir,
    '-G', 'Visual Studio 17 2022',
    '-A', 'x64',
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DBUILD_LIST=core,imgproc,imgcodecs',
    '-DBUILD_opencv_world=OFF',
    '-DBUILD_opencv_python3=OFF',
    '-DBUILD_opencv_java=OFF',
    '-DBUILD_TESTS=OFF',
    '-DBUILD_PERF_TESTS=OFF',
    '-DBUILD_EXAMPLES=OFF',
    '-DBUILD_PNG=ON',
    '-DBUILD_JPEG=ON',
    '-DBUILD_ZLIB=ON',
    '-DBUILD_TIFF=OFF',
    '-DBUILD_WEBP=OFF',
    '-DBUILD_OPENJPEG=OFF',
    '-DBUILD_OPENEXR=OFF',
    '-DWITH_FFMPEG=OFF',
    '-DWITH_GTK=OFF',
    '-DWITH_QT=OFF',
    '-DWITH_PROTOBUF=OFF',
    '-DWITH_IPP=OFF',
    '-DWITH_ITT=OFF',
    '-DWITH_LAPACK=OFF',
    '-DWITH_OPENCL=OFF',
    "-DCMAKE_INSTALL_PREFIX=$InstallDir"
  )

  & cmake @CMakeArgs
  if ($LASTEXITCODE -ne 0) { throw "cmake configure failed (exit $LASTEXITCODE)" }
} else {
  Write-Host '==> Skipping configure (CMakeCache.txt up to date)'
}

# 4. Build + install.
Write-Host '==> Building (Release, parallel)'
& cmake --build $BuildDir --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw "cmake --build failed (exit $LASTEXITCODE)" }

Write-Host "==> Installing to $InstallDir"
& cmake --install $BuildDir --config Release
if ($LASTEXITCODE -ne 0) { throw "cmake --install failed (exit $LASTEXITCODE)" }

# 5. Locate include + lib dirs and emit env hint.
$IncludeDir = Join-Path $InstallDir 'include\opencv4'
if (-not (Test-Path $IncludeDir)) {
  $IncludeDir = Join-Path $InstallDir 'include'
}

$LibCandidates = @(
  (Join-Path $InstallDir 'x64\vc17\staticlib'),
  (Join-Path $InstallDir 'x64\vc17\lib'),
  (Join-Path $InstallDir 'lib')
)
$LibDir = $null
foreach ($candidate in $LibCandidates) {
  if (Test-Path $candidate) { $LibDir = $candidate; break }
}
if (-not $LibDir) {
  throw "Could not locate OpenCV lib dir under $InstallDir"
}

$ThirdPartyCandidates = @(
  (Join-Path $InstallDir 'x64\vc17\staticlib'),
  (Join-Path $LibDir '3rdparty'),
  (Join-Path $InstallDir 'share\OpenCV\3rdparty'),
  (Join-Path $InstallDir 'share\opencv4\3rdparty')
)
$ThirdPartyDir = ''
foreach ($candidate in $ThirdPartyCandidates) {
  if (Test-Path $candidate) { $ThirdPartyDir = $candidate; break }
}

$EnvContent = @"
# Generated by scripts/build-opencv.ps1 - dot-source before ``pnpm native:build``.
`$env:OPENCV_INCLUDE_DIR = '$IncludeDir'
`$env:OPENCV_LIB_DIR = '$LibDir'
`$env:OPENCV_3RDPARTY_DIR = '$ThirdPartyDir'
"@

Set-Content -Path $EnvFile -Value $EnvContent -Encoding utf8

Write-Host ''
Write-Host '==> Done. To wire up the addon build, run:'
Write-Host "    . $EnvFile"
Write-Host ''
Write-Host "    OPENCV_INCLUDE_DIR=$IncludeDir"
Write-Host "    OPENCV_LIB_DIR=$LibDir"
Write-Host "    OPENCV_3RDPARTY_DIR=$ThirdPartyDir"
