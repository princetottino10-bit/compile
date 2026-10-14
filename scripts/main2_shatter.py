#!/usr/bin/env python3
"""Main 2 の実物のカード絵に寄せる「割れとずれ」の加工。

実物 (Compile 2/Compile_ Main 2/Photo) は、描かれた風景を大小の四角いブロックと
鋭い三角の破片に割り、ブロックごとに少しずらしたり色をずらしたりした絵になっている。
元の風景が読める程度に留めるのがポイント (割りすぎると仮絵のモザイクと同じになる)。

    python scripts/main2_shatter.py <in.png> <out.png> [seed] [strength] [dark] [accent_hue 0-1]

決定的: 同じ seed なら同じ結果。
scripts/build_card_art_2.py が読む Main 2 の元絵 (Compile 2/Compile_ Main 2/Illustrations/) はこれで作った。
採用した絵・seed・dark・accent の一覧はその Illustrations/README.md にある。
"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageStat


def split_rects(rng, x0, y0, x1, y1, min_size, max_size, out):
    """ランダムな縦横分割で長方形を作る。横長のブロックが多くなるよう縦方向を細かく切る。"""
    w, h = x1 - x0, y1 - y0
    if (w <= max_size and h <= max_size * 0.6 and rng.random() < 0.55) or w < min_size * 2 or h < min_size * 2:
        out.append((x0, y0, x1, y1))
        return
    if h * 1.6 > w:
        cut = rng.randint(y0 + min_size, y1 - min_size)
        split_rects(rng, x0, y0, x1, cut, min_size, max_size, out)
        split_rects(rng, x0, cut, x1, y1, min_size, max_size, out)
    else:
        cut = rng.randint(x0 + min_size, x1 - min_size)
        split_rects(rng, x0, y0, cut, y1, min_size, max_size, out)
        split_rects(rng, cut, y0, x1, y1, min_size, max_size, out)


def hue_shift(im, dh, sat=1.0, val=1.0):
    hsv = im.convert('HSV')
    h, s, v = hsv.split()
    h = h.point(lambda p: (p + int(dh * 255)) % 256)
    if sat != 1.0:
        s = s.point(lambda p: min(255, int(p * sat)))
    if val != 1.0:
        v = v.point(lambda p: min(255, int(p * val)))
    return Image.merge('HSV', (h, s, v)).convert('RGB')


def shatter(src, seed=0, strength=1.0, dark=1.0, accent=None):
    rng = random.Random(seed)
    w, h = src.size
    unit = max(4, w // 160)                     # 1344 幅で 8px 前後
    base = ImageEnhance.Color(src).enhance(1.25)
    base = ImageEnhance.Contrast(base).enhance(1.1)
    if dark != 1.0:
        base = ImageEnhance.Brightness(base).enhance(dark)
    out = base.copy()

    # 1) ブロック: 一部をずらす・平均色で潰す・色相をずらす
    rects = []
    split_rects(rng, 0, 0, w, h, unit * 2, unit * 14, rects)
    for (x0, y0, x1, y1) in rects:
        r = rng.random() / strength
        if r < 0.38:
            dx = rng.randint(-unit * 8, unit * 8)
            dy = rng.randint(-unit * 2, unit * 2)
            sx0 = min(max(0, x0 + dx), w - (x1 - x0))
            sy0 = min(max(0, y0 + dy), h - (y1 - y0))
            out.paste(base.crop((sx0, sy0, sx0 + x1 - x0, sy0 + y1 - y0)), (x0, y0))
        elif r < 0.52:
            col = tuple(int(c) for c in ImageStat.Stat(base.crop((x0, y0, x1, y1))).mean)
            out.paste(col, (x0, y0, x1, y1))
        elif r < 0.66:
            blk = out.crop((x0, y0, x1, y1))
            out.paste(hue_shift(blk, rng.uniform(-0.08, 0.08), 1.2, rng.uniform(0.9, 1.2)), (x0, y0))

    # 1b) 重ねブロック: 実物の大半は四角の切り貼り。別の場所の四角を色をずらして上に貼る
    for _ in range(int(260 * strength)):
        bw = rng.randint(unit * 3, unit * 14)
        bh = rng.randint(unit * 2, unit * 10)
        x0, y0 = rng.randint(-bw // 2, w - bw // 2), rng.randint(-bh // 2, h - bh // 2)
        dx, dy = rng.randint(-unit * 14, unit * 14), rng.randint(-unit * 5, unit * 5)
        sx0 = min(max(0, x0 + dx), w - bw); sy0 = min(max(0, y0 + dy), h - bh)
        blk = base.crop((sx0, sy0, sx0 + bw, sy0 + bh))
        if accent is not None and rng.random() < 0.08:
            # 差し色: 色相だけ accent に寄せる
            hh, ss, vv = blk.convert('HSV').split()
            hh = hh.point(lambda q: int(accent * 255))
            ss = ss.point(lambda q: min(200, int(q * 1.1) + 20))
            blk = Image.merge('HSV', (hh, ss, vv)).convert('RGB')
        else:
            blk = hue_shift(blk, rng.uniform(-0.05, 0.05), 1.1, rng.uniform(0.8, 1.3))
        out.paste(blk, (x0, y0))

    # 2) 細い横スライスのずれ (実物の水平方向の割れ)
    for _ in range(int(40 * strength)):
        y = rng.randint(0, h - 2)
        bh = rng.randint(unit // 2 + 1, unit * 3)
        dx = rng.randint(-unit * 12, unit * 12)
        strip = out.crop((0, y, w, min(h, y + bh)))
        out.paste(strip, (dx, y))

    # 3) 三角の破片: 別の場所の絵を明るく・色をずらして重ねる
    for _ in range(int(80 * strength)):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        size = rng.uniform(unit * 2, unit * 13)
        # 角ばった3〜5角形 (針のように細い三角は実物にない)
        n = rng.choice((3, 4, 4, 5))
        a0 = rng.uniform(0, 6.283)
        pts = []
        for k in range(n):
            a = a0 + k * 6.283 / n + rng.uniform(-0.35, 0.35)
            rr = size * rng.uniform(0.55, 1.0)
            pts.append((cx + rr * math.cos(a), cy + rr * 0.7 * math.sin(a)))
        bx0 = int(max(0, min(p[0] for p in pts))); by0 = int(max(0, min(p[1] for p in pts)))
        bx1 = int(min(w, max(p[0] for p in pts)) + 1); by1 = int(min(h, max(p[1] for p in pts)) + 1)
        if bx1 - bx0 < 3 or by1 - by0 < 3:
            continue
        dx, dy = rng.randint(-unit * 10, unit * 10), rng.randint(-unit * 4, unit * 4)
        sx0 = min(max(0, bx0 + dx), w - (bx1 - bx0)); sy0 = min(max(0, by0 + dy), h - (by1 - by0))
        patch = base.crop((sx0, sy0, sx0 + bx1 - bx0, sy0 + by1 - by0))
        patch = hue_shift(patch, rng.uniform(-0.06, 0.06), 1.15, rng.uniform(0.95, 1.35))
        mask = Image.new('L', patch.size, 0)
        ImageDraw.Draw(mask).polygon([(x - bx0, y - by0) for x, y in pts], fill=rng.randint(170, 255))
        out.paste(patch, (bx0, by0), mask)

    return out.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    seed = sys.argv[3] if len(sys.argv) > 3 else 'main2'
    strength = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    dark = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    accent = float(sys.argv[6]) if len(sys.argv) > 6 else None
    shatter(Image.open(src).convert('RGB'), seed, strength, dark, accent).save(dst)
