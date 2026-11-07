"""Rebuild the Japanese subset of Shippori Mincho SemiBold used for Japanese titles.

The full family is about 5 MB per weight, so the app ships one subset instead:
Latin, Japanese punctuation, kana, half and full width forms, the 2965 JIS X 0208
level 1 kanji and the characters of the brand mark. Titles with rarer kanji fall
back to the system Mincho named in --f-jp (Hiragino Mincho on macOS, Yu Mincho on
Windows), which keeps the same look.

Usage (fontTools and brotli installed, for example in a throwaway venv):
    python scripts/subset-shippori.py path/to/ShipporiMincho-SemiBold.ttf

The source TTF comes from github.com/google/fonts (ofl/shipporimincho), SIL OFL 1.1.
"""

import sys
from pathlib import Path

from fontTools import subset

BRAND = "綺麗漫画"
UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+2010-2027,U+3000-303F,U+3040-309F,"
    "U+30A0-30FF,U+31F0-31FF,U+FF01-FF60,U+FF61-FF9F"
)
OUT = Path(__file__).resolve().parent.parent / "src/assets/fonts/shippori-mincho-600-jp-subset.woff2"


def jis_level1_kanji() -> str:
    chars = []
    for ku in range(16, 48):
        for ten in range(1, 95):
            try:
                chars.append(bytes([0xA0 + ku, 0xA0 + ten]).decode("euc_jp"))
            except UnicodeDecodeError:
                pass
    return "".join(chars)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: subset-shippori.py ShipporiMincho-SemiBold.ttf")
    subset.main(
        [
            sys.argv[1],
            f"--output-file={OUT}",
            "--flavor=woff2",
            f"--unicodes={UNICODES}",
            f"--text={jis_level1_kanji()}{BRAND}",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
        ]
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
