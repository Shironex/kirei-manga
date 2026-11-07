// Hides the console window on Windows release builds; debug builds keep it so
// logs stay visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kirei_desktop_lib::run();
}
