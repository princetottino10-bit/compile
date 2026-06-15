# -*- coding: utf-8 -*-
"""auto-play.html にカードデータとエンジンを埋め込む。

外部 <script src> に依存しない自己完結ファイルにすることで、
file:// 直開きやプレビューパネルなどどの環境でも動くようにする
(solo-play.html と同じ方式)。

data/cards.json・data/effects.json・engine.js を編集したら再実行すること:

    python scripts/inline_assets.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "auto-play.html"
BEGIN = "<!-- INLINE:ASSETS:BEGIN"
END = "<!-- INLINE:ASSETS:END -->"


def compact(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def main():
    html = TARGET.read_text(encoding="utf-8")
    b = html.find(BEGIN)
    e = html.find(END)
    if b < 0 or e < 0:
        raise SystemExit("マーカーが見つからない: " + str(TARGET))
    b_line_end = html.index("-->", b) + 3

    cards = compact(ROOT / "data" / "cards.json")
    effects = compact(ROOT / "data" / "effects.json")
    engine = (ROOT / "engine.js").read_text(encoding="utf-8")

    block = (
        html[:b_line_end]
        + "\n<script>window.COMPILE_CARDS=" + cards + ";</script>"
        + "\n<script>window.COMPILE_EFFECTS=" + effects + ";</script>"
        + "\n<script>\n" + engine + "\n</script>\n"
        + html[e:]
    )
    TARGET.write_text(block, encoding="utf-8", newline="\n")
    print(f"{TARGET.name}: {TARGET.stat().st_size:,} bytes (cards {len(cards):,} / effects {len(effects):,} / engine {len(engine):,})")


if __name__ == "__main__":
    main()
