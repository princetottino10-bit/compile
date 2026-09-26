"""スリーブの絵を取り込む。
   python scripts/sleeve_import.py <名前> <書き出しの URL か、手元の画像のパス> [残す位置 0〜1]
   まわりの白い余白 (版画の紙の縁など) を切り落とし、カードの裏面の「上の帯 (FACE DOWN と値) より下」
   (512x594) の比に切って、art/sleeves/<名前>.webp に保存する。
   残す位置: 縦にはみ出す分をどこで切るか。0 = 上を残す、0.5 = 中央 (既定)、1 = 下を残す"""
import io
import sys
import urllib.request
from pathlib import Path
from PIL import Image, ImageStat

name, src = sys.argv[1], sys.argv[2]
anchor = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
OUT_W, OUT_H = 512, 594          # cardtex.js の DW x (DH - HEAD_H)
if Path(src).is_file():
    im = Image.open(src).convert('RGB')
else:
    im = Image.open(io.BytesIO(urllib.request.urlopen(src).read())).convert('RGB')


def trim_margin(im):
    """縁の明るくて平らな帯 (紙の余白) を削る。絵の中まで削らないよう、各辺 12% まで"""
    w, h = im.size
    gray = im.convert('L')

    def flat_light(box):
        st = ImageStat.Stat(gray.crop(box))
        return st.mean[0] > 200 and st.stddev[0] < 18

    l, t, r, b = 0, 0, w, h
    while l < w * 0.12 and flat_light((l, t, l + 2, b)): l += 2
    while r > w * 0.88 and flat_light((r - 2, t, r, b)): r -= 2
    while t < h * 0.12 and flat_light((l, t, r, t + 2)): t += 2
    while b > h * 0.88 and flat_light((l, b - 2, r, b)): b -= 2
    if (l, t, r, b) != (0, 0, w, h):
        pad = 6                                         # 縁の境目のにじみも落とす
        im = im.crop((l + pad, t + pad, r - pad, b - pad))
    return im


im = trim_margin(im)
# 生成した絵はカードの形 (角丸) で描かれることがあるので、四隅が入らないよう少し内側を使う
w, h = im.size
im = im.crop((int(w * 0.05), int(h * 0.04), int(w * 0.95), int(h * 0.96)))
w, h = im.size
target = OUT_W / OUT_H
if w / h > target:
    nw = int(h * target)
    x = (w - nw) // 2
    im = im.crop((x, 0, x + nw, h))
else:
    nh = int(w / target)
    y = int((h - nh) * anchor)
    im = im.crop((0, y, w, y + nh))
im = im.resize((OUT_W, OUT_H), Image.LANCZOS)
out = Path(__file__).resolve().parent.parent / 'art' / 'sleeves' / (name + '.webp')
out.parent.mkdir(parents=True, exist_ok=True)
im.save(out, 'WEBP', quality=82)
print(out.name, out.stat().st_size)
