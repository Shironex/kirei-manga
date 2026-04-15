// KireiManga — speech-bubble detector (v0.1 stub)
//
// Minimal NAPI addon that exposes a single `detectBubbles(imagePath: string)`
// function returning an empty JavaScript Array. The real OpenCV-backed
// implementation lands in milestone v0.3 (see PRD §9). This stub keeps the
// build graph wired up end-to-end so the desktop app can load the addon
// once it exists without touching JS-side bindings.

#include <napi.h>

Napi::Value DetectBubbles(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Array::New(env);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "detectBubbles"),
                Napi::Function::New(env, DetectBubbles));
    return exports;
}

NODE_API_MODULE(bubble_detector, Init)
