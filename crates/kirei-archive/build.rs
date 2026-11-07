//! unrar_sys compiles RARLAB's UnRAR, which calls registry, token and
//! CryptoAPI functions from advapi32 on Windows, but does not ask the linker
//! for it. The Tauri app links advapi32 anyway, so only binaries without Tauri
//! (this crate's tests, kirei-reader's tests) failed with LNK2019. Declaring
//! it here propagates to every binary that links kirei-archive.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo::rustc-link-lib=advapi32");
    }
}
