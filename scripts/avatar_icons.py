"""立ち絵 (art/avatar/<キャラ>_<表情>.webp) から、顔の丸いアイコン (art/icons/<キャラ>_<表情>.webp、128x128) を作る。
CHIP で交換するプロフィールのアイコン (js3d/face-icons.js) に使う。立ち絵を描き直したら、これを回し直せばアイコンもそろう。
    E:\SD\ComfyUI\venv\Scripts\python.exe scripts\avatar_icons.py
顔の位置は face_yolov8m (E:\SD\ComfyUI\models\yolov8) で表情ごとに測る (立ち絵は表情ごとに構図が少し違う)。
測れなかった表情は、同じキャラの normal の位置を使う。
"""
import glob
import os

from PIL import Image, ImageDraw
from ultralytics import YOLO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'avatar')
OUT = os.path.join(ROOT, 'art', 'icons')
SIZE = 128
SCALE = 1.3          # 顔の枠に対する丸の大きさ (髪まで入る)
LIFT = 0.06          # 少し上へ (前髪・頭の飾りまで)
BG = (40, 26, 64)    # 丸の中の背景 (切り抜きの透けた所)

def main():
    model = YOLO(r'E:\SD\ComfyUI\models\yolov8\face_yolov8m.pt')
    os.makedirs(OUT, exist_ok=True)
    boxes = {}
    files = sorted(p for p in glob.glob(os.path.join(SRC, '*.webp')) if not os.path.basename(p).startswith('boss_'))
    for p in files:
        name = os.path.basename(p)[:-5]
        if name.endswith('_blink'):
            continue
        im = Image.open(p).convert('RGBA')
        flat = Image.new('RGB', im.size, (90, 80, 110))
        flat.paste(im, mask=im.split()[3])
        r = model(flat, verbose=False, conf=0.2)[0]
        if len(r.boxes):
            b = max(r.boxes, key=lambda b: float(b.conf))
            x0, y0, x1, y1 = [float(v) for v in b.xyxy[0]]
            boxes[name] = ((x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0))
    for p in files:
        name = os.path.basename(p)[:-5]
        if name.endswith('_blink'):
            continue
        box = boxes.get(name) or boxes.get(name.rsplit('_', 1)[0] + '_normal')
        if not box:
            print('顔が見つからない:', name)
            continue
        cx, cy, sz = box
        d = int(sz * SCALE)
        cy -= sz * LIFT
        im = Image.open(p).convert('RGBA')
        canvas = Image.new('RGBA', (im.width + 2 * d, im.height + 2 * d), BG + (255,))
        canvas.alpha_composite(im, (d, d))
        crop = canvas.crop((int(cx + d - d / 2), int(cy + d - d / 2), int(cx + d + d / 2), int(cy + d + d / 2))).resize((SIZE, SIZE), Image.LANCZOS)
        mask = Image.new('L', (SIZE * 4, SIZE * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
        crop.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS))
        crop.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
        print('ok', name)

if __name__ == '__main__':
    main()
