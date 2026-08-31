#!/usr/bin/env python3
"""Generate art/ assets for Main 2 and Aux 2.

Aux 2:
    The toolkit in `Compile 2/` ships real illustrations, two faces each:
        "Assimilation 1.png" -> normal face   -> art/Assimilation.webp
        "Assimilation.png"   -> glitched face -> art/Assimilation_Glitched.webp
    Per-card art (1assimilation..6assimilation) is cut from six different
    crops of the normal illustration.

Main 2:
    The publisher's toolkit contains no card illustrations.  The physical
    product (see `Compile 2/Compile_ Main 2/Photo/`) uses abstract mosaic
    shard art in each protocol's palette, so we synthesise the same style
    procedurally: a jittered triangle mosaic with glitch displacement bars.
    Colors follow data/cards.json so the app stays consistent.

Deterministic: same seed -> same image, safe to re-run.
"""
import colorsys
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'art')
AUX2_DIR = os.path.join(ROOT, 'Compile 2', 'Compile_ Aux 2', 'Toolkit', 'Illustrations')

CARD_W, CARD_H = 360, 490      # 個別カード (既存 art/1darkness.webp と同寸)
FACE_W, FACE_H = 640, 457      # プロトコル面 (既存 art/Darkness.webp と同寸)
QUALITY = 80

MAIN2 = ['CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE',
         'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME', 'WAR']
AUX2 = ['ASSIMILATION', 'DIVERSITY', 'UNITY']


def cap(name):
    return name[0] + name[1:].lower()


def load_colors():
    with open(os.path.join(ROOT, 'data', 'cards.json'), encoding='utf-8') as f:
        data = json.load(f)
    return {p['name']: p['color'] for p in data['protocols']}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- mosaic ---

def shard_color(rng, base_hsv, t, vmod=1.0):
    """パレットからシャード1枚の色を選ぶ。t は 0..1 の位置 (対角グラデ)。"""
    h, s, v = base_hsv
    roll = rng.random()
    if roll < 0.06:
        # 白 / ほぼ白のアクセント
        return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, s * 0.15, 0.96))
    if roll < 0.14:
        # 影 (ほぼ黒)
        return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, min(1, s * 1.2), 0.10 + rng.random() * 0.10))
    if roll < 0.30:
        # 補助色相 (±40°)
        h2 = (h + rng.choice((-1, 1)) * (0.06 + rng.random() * 0.06)) % 1.0
    else:
        h2 = (h + rng.gauss(0, 0.015)) % 1.0
    s2 = min(1.0, max(0.25, s * (0.75 + rng.random() * 0.5)))
    # 対角方向に明→暗の流れ + 低周波の明暗ムラ + 個体差
    v2 = min(1.0, max(0.06, (0.30 + 0.62 * t) * vmod * (0.65 + rng.random() * 0.6)))
    return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h2, s2, v2))


def mosaic(w, h, seed, rgb, cell=30):
    """ジッタ付き格子を三角形に割ったモザイク。公式 Main 2 のシャード調。"""
    rng = random.Random(seed)
    base_hsv = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))

    im = Image.new('RGB', (w, h))
    dr = ImageDraw.Draw(im)

    # 低周波の明暗ムラ (公式アートの「大きな光の固まり」を出す)
    ph1, ph2, ph3 = (rng.uniform(0, math.tau) for _ in range(3))
    f1 = rng.uniform(1.1, 1.9)
    f2 = rng.uniform(1.3, 2.3)

    def brightness(cx, cy):
        u, v = cx / w, cy / h
        n = (math.sin(u * f1 * math.tau + ph1) * math.sin(v * f2 * math.tau + ph2)
             + math.sin((u + v) * 1.4 * math.tau + ph3)) / 2
        return 0.72 + 0.55 * max(-1.0, min(1.0, n))

    cols = w // cell + 2
    rows = h // cell + 2
    jitter = cell * 0.45
    pts = {}
    for j in range(rows + 1):
        for i in range(cols + 1):
            x = i * cell + rng.uniform(-jitter, jitter)
            y = j * cell + rng.uniform(-jitter, jitter)
            pts[(i, j)] = (x - cell, y - cell)

    for j in range(rows):
        for i in range(cols):
            a, b = pts[(i, j)], pts[(i + 1, j)]
            c, d = pts[(i + 1, j + 1)], pts[(i, j + 1)]
            # 対角の向きをランダムに
            tris = ((a, b, c), (a, c, d)) if rng.random() < 0.5 else ((a, b, d), (b, c, d))
            for tri in tris:
                cx = sum(p[0] for p in tri) / 3
                cy = sum(p[1] for p in tri) / 3
                t = 1.0 - (cx / w * 0.5 + cy / h * 0.5)   # 左上が明るい
                dr.polygon(tri, fill=shard_color(rng, base_hsv, t, brightness(cx, cy)))
    return im


def glitch(im, seed, heavy=False):
    """横スライスをずらすグリッチ。heavy はコンパイル面用 (チャンネルずれ付き)。"""
    rng = random.Random(seed)
    w, h = im.size
    out = im.copy()
    bands = rng.randint(10, 16) if heavy else rng.randint(4, 7)
    for _ in range(bands):
        y = rng.randint(0, h - 8)
        bh = rng.randint(3, h // 8 if heavy else h // 16)
        dx = rng.randint(-w // 6, w // 6) if heavy else rng.randint(-w // 14, w // 14)
        strip = im.crop((0, y, w, min(h, y + bh)))
        out.paste(strip, (dx, y))
        if dx > 0:
            out.paste(strip.crop((w - dx, 0, w, strip.height)), (0, y))
        elif dx < 0:
            out.paste(strip.crop((0, 0, -dx, strip.height)), (w + dx, y))
    if heavy:
        # RGB チャンネルを横にずらして色収差を出す
        r, g, b = out.split()
        shift = max(2, w // 90)
        r = r.transform(r.size, Image.AFFINE, (1, 0, -shift, 0, 1, 0))
        b = b.transform(b.size, Image.AFFINE, (1, 0, shift, 0, 1, 0))
        out = Image.merge('RGB', (r, g, b))
        # 走査線
        dr = ImageDraw.Draw(out, 'RGBA')
        for y in range(0, h, 6):
            dr.line([(0, y), (w, y)], fill=(0, 0, 0, 46))
    return out


def save_webp(im, name):
    path = os.path.join(OUT_DIR, name)
    im.save(path, 'WEBP', quality=QUALITY)
    return os.path.getsize(path)


# ---------------------------------------------------------------- aux 2 ----

def crop_cover(im, tw, th):
    w, h = im.size
    scale = max(tw / w, th / h)
    im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    w, h = im.size
    x = (w - tw) // 2
    y = (h - th) // 2
    return im.crop((x, y, x + tw, y + th))


def aux2_cards(im, seed):
    """大判イラストから 6 枚分のクロップを切り出す (番号ごとに別の場所)。"""
    rng = random.Random(seed)
    w, h = im.size
    crops = []
    # カード比率のまま、原画の 45% 幅の窓を 6 箇所
    cw = int(w * 0.45)
    ch = int(cw * CARD_H / CARD_W)
    if ch > h:
        ch = h
        cw = int(ch * CARD_W / CARD_H)
    for n in range(6):
        # 横 3 × 縦 2 のゆるい格子 + ジッタで、毎回違う場所を見せる
        gx = (n % 3) / 2.0
        gy = (n // 3) / 1.0
        x = int(gx * (w - cw) + rng.uniform(-0.05, 0.05) * w)
        y = int(gy * (h - ch) + rng.uniform(-0.05, 0.05) * h)
        x = max(0, min(w - cw, x))
        y = max(0, min(h - ch, y))
        crops.append(im.crop((x, y, x + cw, y + ch)).resize((CARD_W, CARD_H), Image.LANCZOS))
    return crops


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    colors = load_colors()
    total = 0
    count = 0

    # ---- Aux 2: 実物イラストを変換 ----
    for proto in AUX2:
        capname = cap(proto)
        normal = Image.open(os.path.join(AUX2_DIR, capname + ' 1.png')).convert('RGB')
        glitched = Image.open(os.path.join(AUX2_DIR, capname + '.png')).convert('RGB')

        total += save_webp(crop_cover(normal, FACE_W, FACE_H), capname + '.webp')
        total += save_webp(crop_cover(glitched, FACE_W, FACE_H), capname + '_Glitched.webp')
        count += 2
        for n, card in enumerate(aux2_cards(normal, seed=proto), start=1):
            total += save_webp(card, '{}{}.webp'.format(n, proto.lower()))
            count += 1

    # ---- Main 2: モザイク・シャードを手続き生成 ----
    for proto in MAIN2:
        rgb = hex_rgb(colors[proto])
        capname = cap(proto)

        face = mosaic(FACE_W, FACE_H, 'face:' + proto, rgb, cell=26)
        face = glitch(face, 'fg:' + proto, heavy=False)
        total += save_webp(face, capname + '.webp')

        gface = mosaic(FACE_W, FACE_H, 'gface:' + proto, rgb, cell=20)
        gface = glitch(gface, 'gg:' + proto, heavy=True)
        total += save_webp(gface, capname + '_Glitched.webp')
        count += 2

        for n in range(1, 7):
            # 番号ごとにセルの粗さを変えて個体差を出す (値が大きいほど細かい)
            card = mosaic(CARD_W, CARD_H, 'card:{}:{}'.format(proto, n), rgb,
                          cell=34 - n * 2)
            card = glitch(card, 'cg:{}:{}'.format(proto, n), heavy=False)
            card = card.filter(ImageFilter.GaussianBlur(0.4))
            total += save_webp(card, '{}{}.webp'.format(n, proto.lower()))
            count += 1

    print('Generated {} files, {:.2f} MB total'.format(count, total / (1024 * 1024)))


if __name__ == '__main__':
    main()
