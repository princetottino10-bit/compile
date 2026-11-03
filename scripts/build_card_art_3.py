#!/usr/bin/env python3
"""Generate art/ assets for Main 3.

The publisher's images (EN-COMP-MN03-Protocol-Cards*.png, 1039x744) come in
pairs per protocol: the odd file is the "LOADING..." face (glitched, covered
in text) and the even file is the "COMPILED" face (clean illustration with
the name banner at the bottom and the icon at the top right).  Copy them to
`Compile 3/Protocol-Cards/<n>.png` (gitignored; n = 1 for the file without a
number).  From the clean area of each COMPILED face, like Main 2:
    protocol face   -> art/Nova.webp
    glitched face   -> art/Nova_Glitched.webp (heavy glitch() on the face)
    per-card art    -> six crops (art/1nova.webp ..)

Aux 3 (FLEXIBLE / INERT / RIGID): the publisher's images are not in hand yet.
If `Compile 3/Aux3/<Proto>.png` (a clean COMPILED face, any size) exists it is
used like Main 3; otherwise a provisional mosaic in the data/cards.json color
is drawn, the same fallback Main 2 had.

Deterministic: same seed -> same image, safe to re-run.
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import ImageFilter  # noqa: E402
from build_card_art_2 import (CARD_W, CARD_H, FACE_W, FACE_H, aux2_cards, cap, glitch, hex_rgb,  # noqa: E402
                              load_colors, mosaic, save_webp)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'Compile 3', 'Protocol-Cards')

# 公式画像の番号 (COMPILED 面 = 偶数)
COMPILED_FILE = {
    'ENVY': 2, 'GLUTTONY': 4, 'GREED': 6, 'LUST': 8, 'PRIDE': 10, 'SLOTH': 12,
    'WRATH': 14, 'NOVA': 16, 'AMBUSH': 18, 'FULCRUM': 20, 'OVERWHELM': 22, 'MOMENTUM': 24,
}
AUX3 = ['FLEXIBLE', 'INERT', 'RIGID']
AUX3_DIR = os.path.join(ROOT, 'Compile 3', 'Aux3')
# 文字の無いところ: 下の名前の帯 (y 570〜) と右上のアイコン (x 865〜) を外す。角は丸く抜けているので 8px 内側
CLEAN = (8, 8, 860, 560)
# プロトコル面 (640x457 の比率) は帯とアイコンを避けた中央寄り
FACE_BOX = (60, 8, 833, 560)


def main():
    total = count = 0
    for proto, n in COMPILED_FILE.items():
        src = Image.open(os.path.join(SRC_DIR, '{}.png'.format(n))).convert('RGB')
        capname = cap(proto)
        face = src.crop(FACE_BOX).resize((FACE_W, FACE_H), Image.LANCZOS)
        total += save_webp(face, capname + '.webp')
        total += save_webp(glitch(face, 'gg:' + proto, heavy=True), capname + '_Glitched.webp')
        count += 2
        for i, card in enumerate(aux2_cards(src.crop(CLEAN), seed=proto), start=1):
            total += save_webp(card, '{}{}.webp'.format(i, proto.lower()))
            count += 1
    colors = load_colors()
    for proto in AUX3:
        capname = cap(proto)
        src = os.path.join(AUX3_DIR, capname + '.png')
        if os.path.exists(src):
            illust = Image.open(src).convert('RGB')
            face = illust.resize((FACE_W, FACE_H), Image.LANCZOS)
            cards = aux2_cards(illust, seed=proto)
        else:
            rgb = hex_rgb(colors[proto])
            face = glitch(mosaic(FACE_W, FACE_H, 'face:' + proto, rgb, cell=26), 'fg:' + proto, heavy=False)
            cards = []
            for n in range(1, 7):
                c = mosaic(CARD_W, CARD_H, 'card:{}:{}'.format(proto, n), rgb, cell=34 - n * 2)
                cards.append(glitch(c, 'cg:{}:{}'.format(proto, n), heavy=False).filter(ImageFilter.GaussianBlur(0.4)))
        total += save_webp(face, capname + '.webp')
        total += save_webp(glitch(face, 'gg:' + proto, heavy=True), capname + '_Glitched.webp')
        count += 2
        for i, card in enumerate(cards, start=1):
            total += save_webp(card, '{}{}.webp'.format(i, proto.lower()))
            count += 1
    print('Generated {} files, {:.2f} MB total'.format(count, total / (1024 * 1024)))


if __name__ == '__main__':
    main()
