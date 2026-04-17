{
  "variables": {
    "OPENCV_INCLUDE_DIR%": "<!(node -e \"process.stdout.write(process.env.OPENCV_INCLUDE_DIR || '')\")",
    "OPENCV_LIB_DIR%": "<!(node -e \"process.stdout.write(process.env.OPENCV_LIB_DIR || '')\")",
    "OPENCV_3RDPARTY_DIR%": "<!(node -e \"process.stdout.write(process.env.OPENCV_3RDPARTY_DIR || '')\")"
  },
  "targets": [
    {
      "target_name": "bubble_detector",
      "sources": ["src/detector.cpp", "src/detector_core.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(OPENCV_INCLUDE_DIR)"
      ],
      "library_dirs": [
        "<(OPENCV_LIB_DIR)",
        "<(OPENCV_3RDPARTY_DIR)"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-lopencv_imgcodecs",
            "-lopencv_imgproc",
            "-lopencv_core",
            "-llibpng",
            "-llibjpeg-turbo",
            "-lzlib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17", "/EHsc"],
              "ExceptionHandling": 1,
              "RuntimeTypeInfo": "true"
            },
            "VCLinkerTool": {
              "AdditionalDependencies": [
                "Gdi32.lib",
                "User32.lib",
                "Advapi32.lib"
              ]
            }
          }
        }],
        ["OS=='mac'", {
          "libraries": [
            "-lopencv_imgcodecs",
            "-lopencv_imgproc",
            "-lopencv_core",
            "-lpng",
            "-ljpeg-turbo",
            "-lz",
            "-framework", "Accelerate"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ["OS=='linux'", {
          "libraries": [
            "-lopencv_imgcodecs",
            "-lopencv_imgproc",
            "-lopencv_core",
            "-lpng",
            "-ljpeg-turbo",
            "-lz",
            "-ldl",
            "-lpthread"
          ],
          "cflags_cc": ["-std=c++17", "-fexceptions"],
          "cflags_cc!": ["-fno-exceptions"]
        }]
      ]
    }
  ]
}
