#!/usr/bin/env python3
"""Generate lightweight WebP card-art assets for auto-play.html.

Reads the full-resolution illustrations from the (gitignored) `Compile 1/`
source folders and writes downscaled WebP copies into `art/`, which is
tracked in git so GitHub Pages can serve them.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'art')

MAIN_PROTOS = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT',
               'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER']
AUX_PROTOS = ['APATHY', 'HATE', 'LOVE']

MAIN_DIR = os.path.join(ROOT, 'Compile 1', 'Compile_ Main 1', 'Toolkit', 'Illustrations')
AUX_DIR = os.path.join(ROOT, 'Compile 1', 'Compile_ Aux 1', 'Toolkit', 'Illustrations')

NUMBER_WIDTH = 360   # 個別カードイラスト (手札/場のカード用)
ILLUST_WIDTH = 640   # プロトコル見出し/コンパイル面イラスト
QUALITY = 80


def cap(name):
    return name[0] + name[1:].lower()


def save_webp(src_path, dst_path, target_width):
    im = Image.open(src_path)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.mode else 'RGB')
    w, h = im.size
    if w > target_width:
        new_h = round(h * target_width / w)
        im = im.resize((target_width, new_h), Image.LANCZOS)
    im.save(dst_path, 'WEBP', quality=QUALITY)
    return os.path.getsize(dst_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    count = 0
    for protos, src_dir in [(MAIN_PROTOS, MAIN_DIR), (AUX_PROTOS, AUX_DIR)]:
        for proto in protos:
            lower = proto.lower()
            capname = cap(proto)

            for n in range(1, 7):
                src = os.path.join(src_dir, '{}{}.jpg'.format(n, lower))
                dst = os.path.join(OUT_DIR, '{}{}.webp'.format(n, lower))
                total += save_webp(src, dst, NUMBER_WIDTH)
                count += 1

            for ext in ('.jpg', '.png'):
                src = os.path.join(src_dir, capname + ext)
                if os.path.exists(src):
                    dst = os.path.join(OUT_DIR, capname + '.webp')
                    total += save_webp(src, dst, ILLUST_WIDTH)
                    count += 1
                    break

            for suffix in ('_Glitched.png', '_GLitched.png', '_Glitched.jpg'):
                src = os.path.join(src_dir, capname + suffix)
                if os.path.exists(src):
                    dst = os.path.join(OUT_DIR, capname + '_Glitched.webp')
                    total += save_webp(src, dst, ILLUST_WIDTH)
                    count += 1
                    break

    print('Generated {} files, {:.2f} MB total'.format(count, total / (1024 * 1024)))


if __name__ == '__main__':
    main()
