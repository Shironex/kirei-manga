// KireiManga — speech-bubble detector unit tests (v0.3 Slice B.6).
//
// Synthetic-image tests for the pure pipeline declared in detector_core.h.
// No fixture files: cv::Mat is built in-process so the suite is hermetic
// and survives any future fixture reshuffles. The Node-level smoke test
// (apps/desktop/.../bubble-detector.smoke.spec.ts) covers the
// imread → addon → marshal end-to-end path against a real PNG.
//
// These five cases are intentionally narrow — they assert the pipeline
// runs and yields sane shapes at the bare-defaults thresholds documented
// in detector_core.cpp. Recall/precision quality is a Slice C goal,
// validated via scripts/bench-bubble-detector.mjs against a labeled set.

#include <gtest/gtest.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

#include <algorithm>

#include "detector_core.h"

namespace {

cv::Mat MakeBlankPage(int w = 1500, int h = 2200) {
  return cv::Mat(h, w, CV_8UC1, cv::Scalar(255));  // white page
}

// Filled black ellipse so the geometric filter sees a near-convex blob with
// solidity ~ pi/4 (well above kSolidityMin = 0.80? no — pi/4 ~ 0.785, so we
// fill to maximise solidity). Convexity for a filled ellipse is ~1.0.
void DrawSpeechBubble(cv::Mat& page, int cx, int cy, int rx, int ry) {
  cv::ellipse(page, cv::Point(cx, cy), cv::Size(rx, ry), 0.0, 0.0, 360.0,
              cv::Scalar(0), cv::FILLED);
}

}  // namespace

TEST(Detector, BlankPageReturnsNoBubbles) {
  auto page = MakeBlankPage();
  const auto result = RunDetection(page);
  EXPECT_TRUE(result.empty());
}

TEST(Detector, SingleSpeechBubbleIsDetected) {
  auto page = MakeBlankPage();
  DrawSpeechBubble(page, 750, 1100, 150, 100);
  const auto result = RunDetection(page);

  ASSERT_GE(result.size(), 1u);
  // Box should roughly bracket the ellipse centre.
  const auto& b = result[0];
  EXPECT_NEAR(b.x + b.w / 2, 750, 30);
  EXPECT_NEAR(b.y + b.h / 2, 1100, 30);
  EXPECT_GT(b.confidence, 0.5);
  EXPECT_LE(b.confidence, 1.0);
}

TEST(Detector, MultipleBubblesReturnedInReadingOrder) {
  auto page = MakeBlankPage();
  DrawSpeechBubble(page, 750, 500, 120, 80);   // top
  DrawSpeechBubble(page, 750, 1500, 120, 80);  // bottom
  const auto result = RunDetection(page);

  ASSERT_GE(result.size(), 2u);
  // Reading-order sort is top-to-bottom, then left-to-right.
  EXPECT_LT(result[0].y, result[1].y);
}

TEST(Detector, PanelBorderIsRejected) {
  auto page = MakeBlankPage();
  // Long thin axis-aligned rectangle — aspect ratio ~46.7 fails the
  // [kAspectMin, kAspectMax] = [0.2, 5.0] gate, so no result entry should
  // carry an aspect > 5.
  cv::rectangle(page, cv::Rect(50, 50, 1400, 30), cv::Scalar(0), cv::FILLED);
  const auto result = RunDetection(page);

  for (const auto& b : result) {
    const double aspect =
        static_cast<double>(b.w) / static_cast<double>(std::max(1, b.h));
    EXPECT_LT(aspect, 5.0);
  }
}

TEST(Detector, ConfidenceIsBounded) {
  auto page = MakeBlankPage();
  DrawSpeechBubble(page, 750, 1100, 150, 100);
  for (const auto& b : RunDetection(page)) {
    EXPECT_GE(b.confidence, 0.0);
    EXPECT_LE(b.confidence, 1.0);
  }
}
