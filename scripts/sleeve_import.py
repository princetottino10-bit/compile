"""Canva で作ったスリーブの絵を取り込む。
   python scripts/sleeve_import.py <名前> <書き出しの URL>
   9:16 の書き出しを、カードの裏面 (512x716) の比に中央で切り、art/sleeves/<名前>.webp に保存する"""
import io
import sys
import urllib.request
from pathlib import Path
from PIL import Image

name, url = sys.argv[1], sys.argv[2]
data = urllib.request.urlopen(url).read()
im = Image.open(io.BytesIO(data)).convert('RGB')
w, h = im.size
target = 512 / 716
if w / h > target:
    nw = int(h * target)
    x = (w - nw) // 2
    im = im.crop((x, 0, x + nw, h))
else:
    nh = int(w / target)
    y = (h - nh) // 2
    im = im.crop((0, y, w, y + nh))
im = im.resize((512, 716), Image.LANCZOS)
out = Path(__file__).resolve().parent.parent / 'art' / 'sleeves' / (name + '.webp')
out.parent.mkdir(parents=True, exist_ok=True)
im.save(out, 'WEBP', quality=82)
print(out.name, out.stat().st_size)
