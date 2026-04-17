// KireiManga — speech-bubble detector unit tests (v0.3 Slice B.6 / C.1).
//
// Synthetic-image tests for the pure pipeline declared in detector_core.h.
// No fixture files: cv::Mat is built in-process so the suite is hermetic
// and survives any future fixture reshuffles. The Node-level smoke test
// (apps/desktop/.../bubble-detector.smoke.spec.ts) covers the
// imread → addon → marshal end-to-end path against a real PNG.
//
// Cases are intentionally narrow — they assert the pipeline runs and
// yields sane shapes at the bare-defaults thresholds documented in
// detector_core.cpp. Recall/precision quality is a Slice C goal,
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

// Fill a rectangular region with a regular dot grid — synthetic screentone.
// Tuned so the pixel-intensity variance inside the rect lands inside the
// production [kScreentoneVarMin, kScreentoneVarMax] band; if the band moves,
// nudge `spacing` / `radius` here, not the production constants.
void DrawScreentoneBlock(cv::Mat& page, const cv::Rect& region,
                         int spacing = 6, int radius = 2) {
  for (int y = region.y + spacing; y < region.y + region.height; y += spacing) {
    for (int x = region.x + spacing; x < region.x + region.width;
         x += spacing) {
      cv::circle(page, cv::Point(x, y), radius, cv::Scalar(0), cv::FILLED);
    }
  }
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
  // Two bubbles roughly on the same row, then one below.
  DrawSpeechBubble(page, 500, 500, 100, 80);   // top-left
  DrawSpeechBubble(page, 1000, 500, 100, 80);  // top-right
  DrawSpeechBubble(page, 750, 1500, 100, 80);  // below

  // RTL (manga default): row 1 = right-then-left, then row 2 below.
  auto rtl = RunDetection(page, ReadingDirection::Rtl);
  ASSERT_GE(rtl.size(), 3u);
  EXPECT_GT(rtl[0].x, rtl[1].x);  // rightmost first within the top row
  EXPECT_LT(rtl[1].y, rtl[2].y);  // top row before the row below

  // LTR: row 1 = left-then-right, then row 2 below.
  auto ltr = RunDetection(page, ReadingDirection::Ltr);
  ASSERT_GE(ltr.size(), 3u);
  EXPECT_LT(ltr[0].x, ltr[1].x);  // leftmost first within the top row
  EXPECT_LT(ltr[1].y, ltr[2].y);
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

TEST(Detector, TallNarrowBubbleIsAccepted) {
  auto page = MakeBlankPage();
  // Tall narrow speech bubble (vertical strip layout) — aspect ~0.18,
  // would have been rejected pre-C.2 (kAspectMin was 0.2). With loosened
  // aspect range + border-ratio gate, this passes.
  cv::ellipse(page, cv::Point(750, 1100), cv::Size(60, 330), 0, 0, 360,
              cv::Scalar(0), cv::FILLED);
  auto result = RunDetection(page);
  ASSERT_GE(result.size(), 1u);
  // confirm one box centered roughly on the ellipse
  bool found = false;
  for (const auto& b : result) {
    if (std::abs((b.x + b.w / 2) - 750) < 30 &&
        std::abs((b.y + b.h / 2) - 1100) < 30) {
      found = true;
      break;
    }
  }
  EXPECT_TRUE(found);
}

TEST(Detector, ConfidenceIsBounded) {
  auto page = MakeBlankPage();
  DrawSpeechBubble(page, 750, 1100, 150, 100);
  for (const auto& b : RunDetection(page)) {
    EXPECT_GE(b.confidence, 0.0);
    EXPECT_LE(b.confidence, 1.0);
  }
}

TEST(Detector, ScreentoneRegionIsRejected) {
  auto page = MakeBlankPage();
  // Bubble-shaped white region with internal screentone — historically a
  // false positive. Draw a screentone-filled rectangle large enough to
  // pass the area gate.
  DrawScreentoneBlock(page, cv::Rect(500, 800, 500, 600));
  auto result = RunDetection(page);
  // After threshold + screentone filter, no bubble should land at the
  // screentone region's center.
  for (const auto& b : result) {
    bool centered_on_screentone =
        b.x + b.w / 2 > 600 && b.x + b.w / 2 < 1000 &&
        b.y + b.h / 2 > 950 && b.y + b.h / 2 < 1300;
    EXPECT_FALSE(centered_on_screentone);
  }
}
