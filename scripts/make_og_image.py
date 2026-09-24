"""SNS で共有したときに出る画像 (og.jpg、1200x630) を作る。
公式のカードの絵を3枚、斜めに切って並べ、ロゴと一言を載せる (トップ画面と同じ雰囲気)。
使い方: python scripts/make_og_image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
PINK, VIOLET, LAV = (255, 79, 163), (139, 92, 246), (185, 164, 255)
FONTS = 'C:/Windows/Fonts/'
ARTS = ['Fire.webp', 'Gravity.webp', 'Unity.webp']       # 絵の入っているプロトコル


def font(name, size, index=0):
    return ImageFont.truetype(FONTS + name, size, index=index)


def main():
    img = Image.new('RGB', (W, H), (8, 6, 15))
    d = ImageDraw.Draw(img, 'RGBA')
    # 斜めの帯 (桃 → 紫)
    band = Image.new('RGBA', (W * 2, 220), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    for x in range(W * 2):
        t = x / (W * 2)
        c = tuple(int(PINK[i] * (1 - t) + VIOLET[i] * t) for i in range(3))
        bd.line([(x, 0), (x, 220)], fill=c + (70,))
    band = band.rotate(-18, expand=True, resample=Image.BICUBIC)
    img.paste(band, (-500, 120), band)
    # 右: 公式アート3枚を斜めの短冊に
    for k, name in enumerate(ARTS):
        art = Image.open(os.path.join(ROOT, 'art', name)).convert('RGB')
        pw, ph = 190, 470
        art = art.resize((int(art.width * ph / art.height), ph))
        left = (art.width - pw) // 2
        art = art.crop((left, 0, left + pw, ph))
        mask = Image.new('L', (pw, ph), 0)
        ImageDraw.Draw(mask).polygon([(int(pw * .22), 0), (pw, 0), (int(pw * .78), ph), (0, ph)], fill=255)
        x = 640 + k * 170
        y = 70 + k * 30
        img.paste(art, (x, y), mask)
    # 左側を暗く (文字を読ませる)
    shade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(760):
        a = int(210 * max(0, 1 - x / 760) ** 0.8)
        sd.line([(x, 0), (x, H)], fill=(8, 6, 15, a))
    img.paste(shade, (0, 0), shade)
    d = ImageDraw.Draw(img, 'RGBA')
    # ロゴ (グリッチ風に桃と紫をずらす)
    logo = font('bahnschrift.ttf', 150)
    for dx, col in ((-6, VIOLET + (220,)), (6, PINK + (220,)), (0, (255, 255, 255, 255))):
        d.text((70 + dx, 175), 'COMPILE', font=logo, fill=col)
    d.text((74, 140), '//', font=font('bahnschrift.ttf', 44), fill=PINK + (255,))
    d.text((76, 345), '3D ARENA  ·  PROTOCOL CARD BATTLE', font=font('bahnschrift.ttf', 28), fill=LAV + (255,))
    jp = font('YuGothB.ttc', 40)
    d.text((74, 410), 'ブラウザですぐ遊べるカードバトル', font=jp, fill=(255, 255, 255, 255))
    d.text((76, 470), 'CPU 対戦 / オンライン対戦 / 週替わり3連戦', font=font('YuGothB.ttc', 26), fill=(220, 214, 235, 255))
    # 下の細い線
    for x in range(W):
        t = x / W
        c = tuple(int(PINK[i] * (1 - t) + VIOLET[i] * t) for i in range(3))
        d.line([(x, H - 8), (x, H)], fill=c + (255,))
    out = os.path.join(ROOT, 'og.jpg')
    img.save(out, quality=86, optimize=True, progressive=True)
    print(out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
