# KireiManga — bubble-detector C++ tests (v0.3 Slice B.6).
#
# Standalone CMake build path for the GoogleTest harness. The Napi addon
# itself is built via binding.gyp (Node ABI); this CMake project only links
# the pure pipeline (detector_core.cpp) against gtest_main + the same
# vendored OpenCV install that binding.gyp consumes. Run:
#
#   bash native/bubble-detector/scripts/build-opencv.sh   # exports env vars
#   . native/bubble-detector/vendor/opencv-env.sh
#   cmake -S native/bubble-detector/test \
#         -B native/bubble-detector/test/build \
#         -DCMAKE_BUILD_TYPE=Release
#   cmake --build native/bubble-detector/test/build --config Release --parallel
#   ctest --test-dir native/bubble-detector/test/build --output-on-failure -C Release

cmake_minimum_required(VERSION 3.20)
project(bubble_detector_tests CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OpenCV install paths come from build-opencv.{sh,ps1} via opencv-env.{sh,ps1}.
# CI exports them through GITHUB_ENV in the native-prebuild job before this
# step runs; locally, source the env file in the same shell as cmake.
if(NOT DEFINED ENV{OPENCV_INCLUDE_DIR} OR NOT DEFINED ENV{OPENCV_LIB_DIR})
  message(FATAL_ERROR
    "Set OPENCV_INCLUDE_DIR and OPENCV_LIB_DIR before configuring "
    "(source native/bubble-detector/vendor/opencv-env.sh after "
    "running scripts/build-opencv.sh).")
endif()

include_directories($ENV{OPENCV_INCLUDE_DIR})
link_directories($ENV{OPENCV_LIB_DIR})
if(DEFINED ENV{OPENCV_3RDPARTY_DIR} AND NOT "$ENV{OPENCV_3RDPARTY_DIR}" STREQUAL "")
  link_directories($ENV{OPENCV_3RDPARTY_DIR})
endif()

# GoogleTest pinned via FetchContent — no submodule, no system dep.
include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG v1.15.2
)
set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
# MSVC: align gtest's CRT with detector_core.cpp (default dynamic CRT).
if(MSVC)
  set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
endif()
FetchContent_MakeAvailable(googletest)

add_executable(detector_test
  detector_test.cpp
  ${CMAKE_CURRENT_LIST_DIR}/../src/detector_core.cpp
)
target_include_directories(detector_test PRIVATE ${CMAKE_CURRENT_LIST_DIR}/../src)

# Mirror binding.gyp's library names exactly so the same OpenCV install
# satisfies both the Napi addon and this test executable. Windows uses the
# bundled image-codec libs prefixed `lib`; macOS/Linux drop the prefix and
# add platform-specific deps.
if(WIN32)
  target_link_libraries(detector_test PRIVATE
    gtest_main
    opencv_imgcodecs
    opencv_imgproc
    opencv_core
    libpng
    libjpeg-turbo
    zlib
  )
elseif(APPLE)
  target_link_libraries(detector_test PRIVATE
    gtest_main
    opencv_imgcodecs
    opencv_imgproc
    opencv_core
    png
    jpeg-turbo
    z
    "-framework Accelerate"
  )
else()
  target_link_libraries(detector_test PRIVATE
    gtest_main
    opencv_imgcodecs
    opencv_imgproc
    opencv_core
    png
    jpeg-turbo
    z
    dl
    pthread
  )
endif()

enable_testing()
add_test(NAME detector_test COMMAND detector_test)
