"""
Build the manga-ocr sidecar into a single executable via PyInstaller.

Output:
    sidecar/manga-ocr/dist/kirei-ocr            (POSIX)
    sidecar/manga-ocr/dist/kirei-ocr.exe        (Windows)

Then copies to:
    sidecar/manga-ocr/release/{platform}-{arch}/kirei-ocr(.exe)

The release folder is what CI uploads to a GitHub Release asset; the
desktop downloads it on first translation request (Slice D.4).
"""

import argparse
import platform as plat_mod
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--clean",
        action="store_true",
        help="Remove build/, dist/, and release/ before building",
    )
    ap.add_argument(
        "--no-strip",
        action="store_true",
        help="Don't strip the final binary (debug builds)",
    )
    args = ap.parse_args()

    if args.clean:
        for d in ("build", "dist", "release"):
            shutil.rmtree(HERE / d, ignore_errors=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "kirei-ocr",
        "--noconfirm",
        # heavy ML deps need explicit collection — PyInstaller's import
        # scanner misses some submodules and data files (configs, vocabs).
        "--collect-all", "manga_ocr",
        "--collect-data", "transformers",
        "--collect-data", "tokenizers",
        # PIL is fine without --collect-all
        "--hidden-import", "PIL._tkinter_finder",
        # silence the Tk warning on macOS; the sidecar is headless
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "pytest",
        "main.py",
    ]
    if not args.no_strip and sys.platform != "win32":
        cmd.append("--strip")

    print(f"running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=HERE, check=True)

    # Copy the built binary to release/{platform}-{arch}/ for CI upload.
    arch = arch_label()
    plat = platform_label()
    release_dir = HERE / "release" / f"{plat}-{arch}"
    release_dir.mkdir(parents=True, exist_ok=True)

    binary = HERE / "dist" / ("kirei-ocr.exe" if sys.platform == "win32" else "kirei-ocr")
    if not binary.exists():
        print(f"error: expected binary not found at {binary}", file=sys.stderr)
        sys.exit(1)

    target = release_dir / binary.name
    shutil.copy2(binary, target)
    size_mb = target.stat().st_size / (1024 * 1024)
    print(f"OK built {target}  ({size_mb:.1f} MB)")


def platform_label() -> str:
    if sys.platform == "win32":
        return "win32"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        return "linux"
    return sys.platform


def arch_label() -> str:
    m = plat_mod.machine().lower()
    if m in ("x86_64", "amd64"):
        return "x64"
    if m in ("arm64", "aarch64"):
        return "arm64"
    return m


if __name__ == "__main__":
    main()
