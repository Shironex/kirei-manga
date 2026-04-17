// KireiManga — speech-bubble detector core (v0.3 Slice B / C.1).
//
// Pure-CV pipeline: adaptiveThreshold → findContours → 5-axis filter
// (area / aspect / convexity / solidity / screentone variance) → stable
// reading-order sort. Tuning constants below are starter values per the
// v0.3 roadmap §B.2 / §C.1; Slice C.4 revisits them with a benchmark.
//
// Linked into both the Napi addon (src/detector.cpp) and the GoogleTest
// harness (test/detector_test.cpp) — the header detector_core.h is the
// shared, Napi-free interface.

#include "detector_core.h"

#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <cmath>
#include <vector>

namespace {

// Adaptive threshold window. Odd; ~1% of a typical 2000px page width — wide
// enough for bubble outlines, narrow enough to ignore screentone dots.
constexpr int kAdaptiveBlockSize = 31;
constexpr double kAdaptiveC = 5.0;

// Area filter as a fraction of total image area.
constexpr double kAreaMinFrac = 0.002;
constexpr double kAreaMaxFrac = 0.30;

// Bounding-rect aspect ratio (width / height). Loosened in C.2 to admit
// tall narrow speech bubbles in vertical-strip layouts; the symmetric
// short/long-side gate below now carries the panel-border rejection.
constexpr double kAspectMin = 0.15;
constexpr double kAspectMax = 7.0;

// Symmetric short-side / long-side ratio. Catches axis-aligned long-thin
// contours (panel borders, page rules) that the loosened aspect range
// would otherwise let through.
constexpr double kBorderRatioMin = 0.1;

// Convexity = contourArea / convexHullArea. Measures how "filled" the hull
// is by the contour itself — bubbles are near-convex blobs.
constexpr double kConvexityMin = 0.85;

// Solidity = contourArea / boundingRectArea. Independent of hull; rejects
// L-shaped / cross-shaped contours that pass the convexity test.
constexpr double kSolidityMin = 0.80;

// Screentone variance band — variance of 8-bit pixel intensities (i.e. the
// squared standard deviation, units = intensity²) inside the contour's
// bounding rect on the raw grayscale source. Real bubble interiors are
// near-flat white (variance ~ 0); photographic/illustration regions sit
// well above the upper bound. The mid-range here is the dotted-screentone
// signature that adaptiveThreshold + RETR_EXTERNAL accidentally merges
// into a bubble-shaped contour. Slice C.4 benchmark refines these.
constexpr double kScreentoneVarMin = 800.0;
constexpr double kScreentoneVarMax = 4500.0;

// Equal-weight blend for the five scores; documented so Slice C tuning
// has a single place to revisit. Five 0.20s sum to 1.0.
constexpr double kAreaWeight = 0.20;
constexpr double kAspectWeight = 0.20;
constexpr double kConvexityWeight = 0.20;
constexpr double kSolidityWeight = 0.20;
constexpr double kVarianceWeight = 0.20;

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

// Returns the variance of pixel intensities inside the bounding rect.
// Used to detect screentone-dense regions (mid-range variance) that
// adaptiveThreshold + RETR_EXTERNAL accidentally merge into a single
// bubble-shaped contour.
double LocalVariance(const cv::Mat& gray, const cv::Rect& r) {
  cv::Scalar mean, stddev;
  cv::meanStdDev(gray(r), mean, stddev);
  return stddev[0] * stddev[0];
}

// Row-band tolerance for the reading-order sort: any pair of bubbles whose
// vertical midpoints fall within this many pixels are treated as one row.
// Sized to ~30% of the median bubble height so neighbouring panel rows do
// not merge; floored at 20px so pages with very small bubbles still keep a
// usable row band. nth_element gives the median in O(n) average without a
// full sort.
int ComputeRowBand(const std::vector<DetectedBubble>& bubbles) {
  if (bubbles.empty()) return 0;
  std::vector<int> heights;
  heights.reserve(bubbles.size());
  for (const auto& b : bubbles) heights.push_back(b.h);
  const size_t mid = heights.size() / 2;
  std::nth_element(heights.begin(), heights.begin() + mid, heights.end());
  const int median = heights[mid];
  return std::max(20, static_cast<int>(median * 0.3));
}

}  // namespace

std::vector<DetectedBubble> RunDetection(const cv::Mat& gray,
                                        ReadingDirection direction) {
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

    // Panel-border gate — symmetric short/long side ratio catches
    // axis-aligned long-thin contours that the loosened aspect range
    // now allows through.
    const int minSide = std::min(r.width, r.height);
    const int maxSide = std::max(r.width, r.height);
    const double borderRatio =
        maxSide > 0 ? static_cast<double>(minSide) / maxSide : 0.0;
    if (borderRatio < kBorderRatioMin) {
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

    // Screentone gate — last reject step before scoring; runs on raw
    // grayscale, not the threshold image.
    const double variance = LocalVariance(gray, r);
    if (variance > kScreentoneVarMin && variance < kScreentoneVarMax) {
      continue;
    }

    // Confidence = weighted blend of the five scores, each in [0, 1].
    // Equal 0.20 weights for now; Slice C tunes per fixture data.
    const double areaScore = NormalizeArea(area, areaMin, areaMax);
    const double aspectScore = AspectScore(aspect);
    const double varianceScore = Clamp01(1.0 - variance / kScreentoneVarMin);
    const double confidence = Clamp01(areaScore * kAreaWeight +
                                      aspectScore * kAspectWeight +
                                      convexity * kConvexityWeight +
                                      solidity * kSolidityWeight +
                                      varianceScore * kVarianceWeight);

    result.push_back(DetectedBubble{r.x, r.y, r.width, r.height, confidence});
  }

  // Reading-order sort: group bubbles into rows by vertical-midpoint
  // proximity (rowBand), then within a row apply the configured reading
  // direction. Stable so equal keys preserve detection order.
  const int rowBand = ComputeRowBand(result);
  std::stable_sort(
      result.begin(), result.end(),
      [rowBand, direction](const DetectedBubble& a, const DetectedBubble& b) {
        const int aMid = a.y + a.h / 2;
        const int bMid = b.y + b.h / 2;
        if (std::abs(aMid - bMid) > rowBand) {
          return aMid < bMid;
        }
        // Same row: rightmost-first for RTL, leftmost-first for LTR.
        if (direction == ReadingDirection::Rtl) {
          return (a.x + a.w / 2) > (b.x + b.w / 2);
        }
        return (a.x + a.w / 2) < (b.x + b.w / 2);
      });

  return result;
}
