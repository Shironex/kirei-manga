#!/usr/bin/env sh
# Build a static, minimal OpenCV for the bubble-detector addon (POSIX: macOS + Linux).
# Idempotent: re-running with the cache populated short-circuits download and configure.
# Outputs `vendor/opencv-install/` and prints the env vars binding.gyp expects.

set -eu
# Bash-only strict mode opt-in (POSIX `sh` doesn't grok `pipefail`).
if [ -n "${BASH_VERSION:-}" ]; then
  set -o pipefail
fi

OPENCV_VERSION="4.11.0"
OPENCV_SHA256="9a7c11f924eff5f8d8070e297b322ee68b9227e003fd600d4b8122198091665f"
OPENCV_URL="https://github.com/opencv/opencv/archive/refs/tags/${OPENCV_VERSION}.tar.gz"

# Resolve the addon root regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDON_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDOR_DIR="${ADDON_DIR}/vendor"
SRC_DIR="${VENDOR_DIR}/opencv-src"
BUILD_DIR="${VENDOR_DIR}/opencv-build"
INSTALL_DIR="${VENDOR_DIR}/opencv-install"
TARBALL="${VENDOR_DIR}/opencv-${OPENCV_VERSION}.tar.gz"
ENV_FILE="${VENDOR_DIR}/opencv-env.sh"

mkdir -p "${VENDOR_DIR}"

# Architecture detection — CI cross-build can override via env.
if [ -n "${KIREI_OPENCV_TARGET_ARCH:-}" ]; then
  ARCH="${KIREI_OPENCV_TARGET_ARCH}"
else
  ARCH="$(uname -m)"
fi

UNAME_S="$(uname -s)"
case "${UNAME_S}" in
  Darwin) PLATFORM="macos" ;;
  Linux) PLATFORM="linux" ;;
  *) echo "Unsupported platform: ${UNAME_S}" >&2; exit 1 ;;
esac

# CI must fail loudly if the SHA placeholder slipped through.
if [ "${OPENCV_SHA256}" = "OPENCV_SHA256_TODO" ]; then
  echo "ERROR: OPENCV_SHA256 is a TODO placeholder — refusing to download." >&2
  echo "Pin the verified SHA256 of opencv-${OPENCV_VERSION}.tar.gz before building." >&2
  exit 1
fi

verify_sha256() {
  file="$1"; expected="$2"
  if command -v shasum >/dev/null 2>&1; then
    printf "%s  %s\n" "${expected}" "${file}" | shasum -a 256 -c -
  elif command -v sha256sum >/dev/null 2>&1; then
    printf "%s  %s\n" "${expected}" "${file}" | sha256sum -c -
  else
    echo "ERROR: no shasum or sha256sum available." >&2
    exit 1
  fi
}

# 1. Download + verify (skip if cached tarball still matches).
if [ -f "${TARBALL}" ] && verify_sha256 "${TARBALL}" "${OPENCV_SHA256}" >/dev/null 2>&1; then
  echo "==> Using cached tarball ${TARBALL}"
else
  echo "==> Downloading ${OPENCV_URL}"
  curl -fL --retry 3 -o "${TARBALL}" "${OPENCV_URL}"
  echo "==> Verifying SHA256"
  verify_sha256 "${TARBALL}" "${OPENCV_SHA256}"
fi

# 2. Extract (skip if already extracted).
if [ ! -d "${SRC_DIR}" ]; then
  echo "==> Extracting to ${SRC_DIR}"
  rm -rf "${VENDOR_DIR}/opencv-${OPENCV_VERSION}"
  tar -xzf "${TARBALL}" -C "${VENDOR_DIR}"
  mv "${VENDOR_DIR}/opencv-${OPENCV_VERSION}" "${SRC_DIR}"
fi

# 3. Configure (skip if CMakeCache.txt is newer than this script).
NEED_CONFIGURE=1
if [ -f "${BUILD_DIR}/CMakeCache.txt" ] && [ "${BUILD_DIR}/CMakeCache.txt" -nt "$0" ]; then
  NEED_CONFIGURE=0
fi

if [ "${NEED_CONFIGURE}" -eq 1 ]; then
  echo "==> Configuring (cmake) into ${BUILD_DIR}"
  mkdir -p "${BUILD_DIR}"

  CMAKE_ARGS="-S ${SRC_DIR} -B ${BUILD_DIR} \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DBUILD_LIST=core,imgproc,imgcodecs \
    -DBUILD_opencv_world=OFF \
    -DBUILD_opencv_python3=OFF \
    -DBUILD_opencv_java=OFF \
    -DBUILD_TESTS=OFF \
    -DBUILD_PERF_TESTS=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_PNG=ON \
    -DBUILD_JPEG=ON \
    -DBUILD_ZLIB=ON \
    -DBUILD_TIFF=OFF \
    -DBUILD_WEBP=OFF \
    -DBUILD_OPENJPEG=OFF \
    -DBUILD_OPENEXR=OFF \
    -DWITH_FFMPEG=OFF \
    -DWITH_GTK=OFF \
    -DWITH_QT=OFF \
    -DWITH_PROTOBUF=OFF \
    -DWITH_IPP=OFF \
    -DWITH_ITT=OFF \
    -DWITH_LAPACK=OFF \
    -DWITH_OPENCL=OFF \
    -DCMAKE_INSTALL_PREFIX=${INSTALL_DIR}"

  if [ "${PLATFORM}" = "macos" ]; then
    CMAKE_ARGS="${CMAKE_ARGS} -DCMAKE_OSX_ARCHITECTURES=${ARCH} -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15"
  fi

  # shellcheck disable=SC2086
  cmake ${CMAKE_ARGS}
else
  echo "==> Skipping configure (CMakeCache.txt up to date)"
fi

# 4. Build + install — parallelism comes from sysctl (mac) or nproc (linux).
if command -v sysctl >/dev/null 2>&1 && sysctl -n hw.ncpu >/dev/null 2>&1; then
  JOBS="$(sysctl -n hw.ncpu)"
elif command -v nproc >/dev/null 2>&1; then
  JOBS="$(nproc)"
else
  JOBS=2
fi

echo "==> Building (jobs=${JOBS})"
cmake --build "${BUILD_DIR}" --config Release --parallel "${JOBS}"

echo "==> Installing to ${INSTALL_DIR}"
cmake --install "${BUILD_DIR}" --config Release

# 5. Locate include + lib dirs and emit env hint.
OPENCV_INCLUDE_DIR="${INSTALL_DIR}/include/opencv4"
if [ ! -d "${OPENCV_INCLUDE_DIR}" ]; then
  OPENCV_INCLUDE_DIR="${INSTALL_DIR}/include"
fi

# OpenCV's static install drops archives + bundled image libs under one of these.
if [ -d "${INSTALL_DIR}/lib" ]; then
  OPENCV_LIB_DIR="${INSTALL_DIR}/lib"
elif [ -d "${INSTALL_DIR}/lib64" ]; then
  OPENCV_LIB_DIR="${INSTALL_DIR}/lib64"
else
  echo "ERROR: could not locate OpenCV lib dir under ${INSTALL_DIR}" >&2
  exit 1
fi

# Bundled 3rdparty static libs (libpng, libjpeg-turbo, zlib) live under lib/opencv4/3rdparty.
OPENCV_3RDPARTY_DIR=""
for candidate in \
  "${INSTALL_DIR}/lib/opencv4/3rdparty" \
  "${INSTALL_DIR}/lib/3rdparty" \
  "${INSTALL_DIR}/share/OpenCV/3rdparty" \
  "${INSTALL_DIR}/share/opencv4/3rdparty"; do
  if [ -d "${candidate}" ]; then
    OPENCV_3RDPARTY_DIR="${candidate}"
    break
  fi
done

cat >"${ENV_FILE}" <<EOF
# Generated by scripts/build-opencv.sh — source this before \`pnpm native:build\`.
export OPENCV_INCLUDE_DIR="${OPENCV_INCLUDE_DIR}"
export OPENCV_LIB_DIR="${OPENCV_LIB_DIR}"
export OPENCV_3RDPARTY_DIR="${OPENCV_3RDPARTY_DIR}"
EOF

echo ""
echo "==> Done. To wire up the addon build, run:"
echo "    eval \"\$(cat ${ENV_FILE})\""
echo "or:"
echo "    source ${ENV_FILE}"
echo ""
echo "    OPENCV_INCLUDE_DIR=${OPENCV_INCLUDE_DIR}"
echo "    OPENCV_LIB_DIR=${OPENCV_LIB_DIR}"
echo "    OPENCV_3RDPARTY_DIR=${OPENCV_3RDPARTY_DIR}"
