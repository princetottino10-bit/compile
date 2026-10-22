"""ちびの絵 (art/chibi/*.webp) の外側の白いフチを外す。
ちびは Anima のステッカー絵柄で描いて (白い太い縁)、切り出しで淡い縁 (chibi_cut.py の RIM) も付け直している。
地図の上ではフチが浮いて見える (2026-10-21 ユーザー「フチが白いの残念」) ので、外側から白っぽい画素だけを剥がす。
    python3 scripts/chibi_unrim.py art/chibi/*.webp     (上書き。PC で書き出し直したら、art/chibi へ写したあとに回す)
白の判定を緩めると、瑠璃の淡い水色の髪 (触手の房) まで削れる。縁の色そのものと、ほぼ真っ白な画素だけを剥がす。
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

RIM = np.array([235, 240, 250])      # chibi_cut.py の縁の色


def grow(mask):
    g = mask.copy()
    g[1:] |= mask[:-1]; g[:-1] |= mask[1:]; g[:, 1:] |= mask[:, :-1]; g[:, :-1] |= mask[:, 1:]
    return g


def unrim(im, depth=10):
    a = np.asarray(im.convert('RGBA')).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    spread = rgb.max(-1) - rgb.min(-1)
    white = (np.abs(rgb - RIM).sum(-1) <= 30) | ((rgb.min(-1) >= 228) & (spread <= 10))
    out = al < 40
    peel = np.zeros_like(out)
    for _ in range(depth):              # 外から、白い画素だけをたどって剥がす (線画の黒で止まる)
        new = grow(out | peel) & white & ~peel & ~out
        if not new.any():
            break
        peel |= new
    # 剥がしたあとの縁に残る、灰色や半透明の細い粒 (2px まで)
    grey = (rgb.min(-1) >= 120) & (spread <= 12)
    for _ in range(2):
        n = out | peel
        peel |= grow(n) & ~n & (grey | (al < 200))
    al2 = np.where(peel, 0, al).astype(np.uint8)
    soft = np.asarray(Image.fromarray(al2).filter(ImageFilter.GaussianBlur(0.5)))
    return Image.fromarray(np.dstack([rgb, np.minimum(soft, al2)]).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        unrim(Image.open(p)).save(p, 'WEBP', quality=90, method=6)
        print(p)
