{
  "conditions": [
    ["OS=='win'", {
      "targets": [
        {
          "target_name": "bubble_detector",
          "sources": ["src/detector.cpp"],
          "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
          "defines": [
            "NAPI_VERSION=8",
            "NAPI_DISABLE_CPP_EXCEPTIONS"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }
      ]
    }, {
      "targets": [
        {
          "target_name": "bubble_detector",
          "type": "none"
        }
      ]
    }]
  ]
}
