fn main() {
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    if let Err(error) = tauri_build::try_build(attributes) {
        panic!("tauri-build failed: {error:#}");
    }

    embed_app_manifest();
}

/// `tauri_build` embeds its Common Controls v6 manifest into the app binary
/// only, so `cargo test` binaries get none and bind System32's comctl32 v5.82.
/// Anything importing a v6-only export (`TaskDialogIndirect`, used by the
/// dialog plugin) then dies at load with `STATUS_ENTRYPOINT_NOT_FOUND` before a
/// single test runs. Linking `app.manifest` here covers every target, and
/// tauri's own copy is switched off above so the two never collide.
fn embed_app_manifest() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let Ok(dir) = std::env::var("CARGO_MANIFEST_DIR") else {
        return;
    };
    let manifest = std::path::Path::new(&dir).join("app.manifest");

    println!("cargo::rerun-if-changed=app.manifest");
    println!("cargo::rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo::rustc-link-arg=/MANIFESTINPUT:{}",
        manifest.display()
    );
}
