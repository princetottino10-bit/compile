"""足もとに残った床の影 (薄い灰色の横線) を消す。黒い靴底より下と、靴底の高さで靴の外へ横に伸びた明るい画素を透明にする"""
#   python3 scripts/chibi_floorfix.py art/chibi/<id>_side_stand.webp ...   (chibi_unrim.py のあとに、影が残った絵だけ)
import sys
import numpy as np
from PIL import Image
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGBA'); a = np.asarray(im).copy()
    rgb = a[..., :3].astype(int); al = a[..., 3]
    lum = rgb.mean(-1); sat = rgb.max(-1) - rgb.min(-1)
    dark = (al > 128) & (lum < 90)
    ys = np.nonzero(dark.any(1))[0]; sole = ys.max()
    light = (al > 0) & (lum > 110) & (sat < 30)
    H = a.shape[0]
    kill = np.zeros_like(al, bool)
    kill[sole + 2:] = al[sole + 2:] > 0
    # 靴底の行の近くで、真上 10px に黒が無い明るい画素 (横に伸びた影)
    for y in range(max(0, sole - 4), min(H, sole + 2)):
        for x in np.nonzero(light[y])[0]:
            if not dark[max(0, y - 10):y + 3, max(0, x - 2):x + 3].any():
                kill[y, x] = True
    a[..., 3][kill] = 0
    Image.fromarray(a).save(f, 'WEBP', quality=90, method=6)
    print(f, int(kill.sum()))
