// KireiManga — speech-bubble detector (v0.3 Slice B.2 — synchronous core).
//
// Pipeline: imread → adaptiveThreshold → findContours → 4-axis geometric
// filter (area / aspect / convexity / solidity) → stable reading-order sort
// → Napi marshal. Tuning constants below are starter values per the v0.3
// roadmap §B.2; Slice C revisits them with a fixture benchmark.
//
// Synchronous for now; AsyncWorker wrapping lands in Slice B.3.

#include <napi.h>

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

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

struct DetectedBubble {
  int x;
  int y;
  int w;
  int h;
  double confidence;
};

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

// Detect bubble candidates from a grayscale page image. Pure function: no
// global state, no caches, safe to call concurrently from worker threads.
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

}  // namespace

Napi::Value DetectBubbles(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(
        env, "detectBubbles(imagePath: string): expected 1 argument")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  const std::string path = info[0].As<Napi::String>().Utf8Value();
  if (path.empty()) {
    Napi::Error::New(env, "detectBubbles: imagePath must be non-empty")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  try {
    const cv::Mat gray = cv::imread(path, cv::IMREAD_GRAYSCALE);
    if (gray.empty()) {
      Napi::Error::New(env, "Failed to load image: " + path)
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    const std::vector<DetectedBubble> bubbles = RunDetection(gray);

    Napi::Array out = Napi::Array::New(env, bubbles.size());
    for (size_t i = 0; i < bubbles.size(); ++i) {
      const DetectedBubble& b = bubbles[i];
      Napi::Object obj = Napi::Object::New(env);
      obj.Set("x", Napi::Number::New(env, b.x));
      obj.Set("y", Napi::Number::New(env, b.y));
      obj.Set("w", Napi::Number::New(env, b.w));
      obj.Set("h", Napi::Number::New(env, b.h));
      obj.Set("confidence", Napi::Number::New(env, b.confidence));
      out.Set(static_cast<uint32_t>(i), obj);
    }
    return out;
  } catch (const cv::Exception& e) {
    Napi::Error::New(env, std::string("OpenCV error: ") + e.what())
        .ThrowAsJavaScriptException();
    return env.Null();
  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Detector error: ") + e.what())
        .ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "detectBubbles"),
              Napi::Function::New(env, DetectBubbles));
  return exports;
}

NODE_API_MODULE(bubble_detector, Init)
