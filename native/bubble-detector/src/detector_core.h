// KireiManga — speech-bubble detector core (pure pipeline).
//
// This header is the public surface shared by the Napi addon entry
// (src/detector.cpp) and the GoogleTest harness (test/detector_test.cpp).
// Keeping it Napi-free lets tests link against detector_core.cpp directly
// without pulling in node-addon-api or libuv.
//
// The tuning constants used inside RunDetection live in detector_core.cpp's
// anonymous namespace — Slice C of the v0.3 roadmap revisits them. Tests
// observe outputs only; they don't poke at the constants directly.

#ifndef KIREIMANGA_BUBBLE_DETECTOR_DETECTOR_CORE_H_
#define KIREIMANGA_BUBBLE_DETECTOR_DETECTOR_CORE_H_

#include <opencv2/core.hpp>

#include <vector>

struct DetectedBubble {
  int x;
  int y;
  int w;
  int h;
  double confidence;
};

// Detect bubble candidates from a grayscale page image. Pure function: no
// global state, no caches, safe to call concurrently from worker threads.
// An empty `gray` returns an empty vector (no error).
std::vector<DetectedBubble> RunDetection(const cv::Mat& gray);

#endif  // KIREIMANGA_BUBBLE_DETECTOR_DETECTOR_CORE_H_
