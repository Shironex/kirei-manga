// KireiManga — speech-bubble detector Napi entry (v0.3 Slice B.3).
//
// Thin wrapper: validates JS arguments, queues a Napi::AsyncWorker that
// reads the page off disk and calls into the pure pipeline declared in
// detector_core.h. The renderer's event loop never blocks — detectBubbles()
// returns a Promise resolved on the libuv worker pool thread's OnOK.
//
// Pipeline behaviour, tuning constants, and helpers live in detector_core.cpp.

#include <napi.h>

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>

#include <string>
#include <utility>
#include <vector>

#include "detector_core.h"

namespace {

class BubbleDetectorWorker : public Napi::AsyncWorker {
 public:
  BubbleDetectorWorker(Napi::Env env, std::string path)
      : Napi::AsyncWorker(env),
        imagePath_(std::move(path)),
        deferred_(Napi::Promise::Deferred::New(env)) {}

  ~BubbleDetectorWorker() override = default;

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    // Worker-pool thread: NO Napi calls allowed here.
    // The catch-all is required: NAPI_DISABLE_CPP_EXCEPTIONS means the
    // runtime will not catch a stray C++ throw at the JS boundary, so
    // letting one escape Execute() would terminate the worker thread.
    try {
      cv::Mat gray = cv::imread(imagePath_, cv::IMREAD_GRAYSCALE);
      if (gray.empty()) {
        SetError("Failed to load image: " + imagePath_);
        return;
      }
      result_ = RunDetection(gray);
    } catch (const cv::Exception& e) {
      SetError(std::string("OpenCV error: ") + e.what());
    } catch (const std::exception& e) {
      SetError(std::string("Detector error: ") + e.what());
    } catch (...) {
      SetError("Detector error: unknown exception");
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);
    Napi::Array arr = Napi::Array::New(env, result_.size());
    for (size_t i = 0; i < result_.size(); ++i) {
      const DetectedBubble& b = result_[i];
      Napi::Object obj = Napi::Object::New(env);
      obj.Set("x", Napi::Number::New(env, b.x));
      obj.Set("y", Napi::Number::New(env, b.y));
      obj.Set("w", Napi::Number::New(env, b.w));
      obj.Set("h", Napi::Number::New(env, b.h));
      obj.Set("confidence", Napi::Number::New(env, b.confidence));
      arr.Set(static_cast<uint32_t>(i), obj);
    }
    deferred_.Resolve(arr);
  }

  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

 private:
  std::string imagePath_;
  std::vector<DetectedBubble> result_;
  Napi::Promise::Deferred deferred_;
};

}  // namespace

Napi::Value DetectBubbles(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Argument validation is synchronous: programmer errors throw immediately,
  // IO/OpenCV failures reject the Promise from inside the worker.
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(
        env, "detectBubbles(imagePath: string): expected 1 argument")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();
  if (path.empty()) {
    Napi::Error::New(env, "detectBubbles: imagePath must be non-empty")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  // Queue() takes ownership; the base class deletes the worker after
  // OnOK/OnError returns. Do not delete explicitly.
  auto* worker = new BubbleDetectorWorker(env, std::move(path));
  worker->Queue();
  return worker->GetPromise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "detectBubbles"),
              Napi::Function::New(env, DetectBubbles));
  return exports;
}

NODE_API_MODULE(bubble_detector, Init)
