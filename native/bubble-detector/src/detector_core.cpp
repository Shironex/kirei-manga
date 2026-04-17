// KireiManga — speech-bubble detector core (v0.3 Slice B).
//
// Pure-CV pipeline: adaptiveThreshold → findContours → 4-axis geometric
// filter (area / aspect / convexity / solidity) → stable reading-order sort.
// Tuning constants below are starter values per the v0.3 roadmap §B.2;
// Slice C revisits them with a fixture benchmark.
//
// Linked into both the Napi addon (src/detector.cpp) and the GoogleTest
// harness (test/detector_test.cpp) — the header detector_core.h is the
// shared, Napi-free interface.

#include "detector_core.h"

#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <cmath>

namespace {

// Adaptive threshold window. Odd; ~1% of a typical 2000px page width — wide
// enough for bubble outlines, narrow enough to ignore screentone dots.
constexpr int kAdaptiveBlockSize = 31;
constexpr double kAdaptiveC = 5.0;

// Area filter as a fraction of total image area.
constexpr double kAreaMinFrac = 0.002;
constexpr double kAreaMaxFrac = 0.30;

// Bounding-rect aspect ratio (width / height). Excludes panel borders and
// long thin rules while keeping vertical/horizontal bubbles.
constexpr double kAspectMin = 0.2;
constexpr double kAspectMax = 5.0;

// Convexity = contourArea / convexHullArea. Measures how "filled" the hull
// is by the contour itself — bubbles are near-convex blobs.
constexpr double kConvexityMin = 0.85;

// Solidity = contourArea / boundingRectArea. Independent of hull; rejects
// L-shaped / cross-shaped contours that pass the convexity test.
constexpr double kSolidityMin = 0.80;

// Equal-weight blend for the four geometric scores; documented so Slice C
// tuning has a single place to revisit.
constexpr double kAreaWeight = 0.25;
constexpr double kAspectWeight = 0.25;
constexpr double kConvexityWeight = 0.25;
constexpr double kSolidityWeight = 0.25;

// Map a value into [0, 1] linearly between lo and hi, clamped.
double NormalizeArea(double area, double lo, double hi) {
  if (hi <= lo) {
    return 0.0;
  }
  const double t = (area - lo) / (hi - lo);
  if (t < 0.0) return 0.0;
  if (t > 1.0) return 1.0;
  return t;
}

// Aspect score peaks at 1.0 for square (aspect == 1) and decays toward 0
// at the edges of the [kAspectMin, kAspectMax] window using log-distance.
double AspectScore(double aspect) {
  if (aspect <= 0.0) return 0.0;
  const double distance = std::abs(std::log(aspect)) / std::log(kAspectMax);
  return std::max(0.0, 1.0 - std::min(1.0, distance));
}

double Clamp01(double v) {
  if (v < 0.0) return 0.0;
  if (v > 1.0) return 1.0;
  return v;
}

}  // namespace

std::vector<DetectedBubble> RunDetection(const cv::Mat& gray) {
  std::vector<DetectedBubble> result;
  if (gray.empty()) {
    return result;
  }

  cv::Mat binary;
  cv::adaptiveThreshold(gray,
                        binary,
                        255.0,
                        cv::ADAPTIVE_THRESH_GAUSSIAN_C,
                        cv::THRESH_BINARY_INV,
                        kAdaptiveBlockSize,
                        kAdaptiveC);

  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(binary,
                   contours,
                   cv::RETR_EXTERNAL,
                   cv::CHAIN_APPROX_SIMPLE);

  const double imgArea =
      static_cast<double>(gray.cols) * static_cast<double>(gray.rows);
  const double areaMin = imgArea * kAreaMinFrac;
  const double areaMax = imgArea * kAreaMaxFrac;

  result.reserve(contours.size());

  for (const auto& contour : contours) {
    const double area = cv::contourArea(contour);
    if (area < areaMin || area > areaMax) {
      continue;
    }

    const cv::Rect r = cv::boundingRect(contour);
    if (r.width <= 0 || r.height <= 0) {
      continue;
    }

    const double aspect =
        static_cast<double>(r.width) / static_cast<double>(r.height);
    if (aspect < kAspectMin || aspect > kAspectMax) {
      continue;
    }

    std::vector<cv::Point> hull;
    cv::convexHull(contour, hull);
    const double hullArea = cv::contourArea(hull);
    const double convexity = hullArea > 0.0 ? area / hullArea : 0.0;
    if (convexity < kConvexityMin) {
      continue;
    }

    const double rectArea =
        static_cast<double>(r.width) * static_cast<double>(r.height);
    const double solidity = rectArea > 0.0 ? area / rectArea : 0.0;
    if (solidity < kSolidityMin) {
      continue;
    }

    // Confidence = weighted blend of the four geometric scores, each in
    // [0, 1]. Equal weights for now; Slice C tunes per fixture data.
    const double areaScore = NormalizeArea(area, areaMin, areaMax);
    const double aspectScore = AspectScore(aspect);
    const double confidence = Clamp01(areaScore * kAreaWeight +
                                      aspectScore * kAspectWeight +
                                      convexity * kConvexityWeight +
                                      solidity * kSolidityWeight);

    result.push_back(DetectedBubble{r.x, r.y, r.width, r.height, confidence});
  }

  // Reading-order sort: top-to-bottom, then left-to-right. Stable so equal
  // y-coordinates preserve insertion order. Slice C adds RTL handling.
  std::stable_sort(result.begin(),
                   result.end(),
                   [](const DetectedBubble& a, const DetectedBubble& b) {
                     if (a.y != b.y) return a.y < b.y;
                     return a.x < b.x;
                   });

  return result;
}
