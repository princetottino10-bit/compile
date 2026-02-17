"""Generate apple-touch-icon for COMPILE card list app."""
from PIL import Image, ImageDraw, ImageFont
import math

SIZE = 540  # Render at 3x then downscale for clean antialiasing
FINAL = 180

img = Image.new('RGB', (SIZE, SIZE), (10, 10, 18))
draw = ImageDraw.Draw(img, 'RGBA')

pk = (233, 30, 140)
pk2 = (255, 80, 180)

cx, cy = SIZE // 2, SIZE // 2

# Hexagon helper
def hex_pts(cx, cy, r, rot=0):
    return [(cx + r * math.cos(math.radians(60 * i + rot)),
             cy + r * math.sin(math.radians(60 * i + rot))) for i in range(6)]

# Dark hexagon fill
draw.polygon(hex_pts(cx, cy, 174, 30), fill=(16, 14, 24))

# Hexagon border (thick, using multiple outlines)
for offset in range(6):
    draw.polygon(hex_pts(cx, cy, 174 + offset, 30), outline=(*pk, max(0, 255 - offset * 50)))

# "C" using thick arc
c_cx, c_cy = cx - 24, cy
r_outer, r_inner = 90, 58
# Draw thick arc by layering ellipses with arc
for r in range(r_inner, r_outer + 1):
    bbox = [c_cx - r, c_cy - r, c_cx + r, c_cy + r]
    draw.arc(bbox, start=150, end=210 + 360, fill=pk, width=1)

# Clean inner cutout to make the C opening crisp
# Erase the gap area (right side of C, ~330 to 30 degrees)
for r in range(0, r_outer + 2):
    bbox = [c_cx - r, c_cy - r, c_cx + r, c_cy + r]
    draw.arc(bbox, start=-30, end=30, fill=(16, 14, 24), width=2)

# Better approach: overdraw the C gap with background
gap_pts = [
    (c_cx, c_cy),
    (c_cx + 120 * math.cos(math.radians(-32)), c_cy + 120 * math.sin(math.radians(-32))),
    (c_cx + 120, c_cy),
    (c_cx + 120 * math.cos(math.radians(32)), c_cy + 120 * math.sin(math.radians(32))),
]
draw.polygon(gap_pts, fill=(16, 14, 24))

# Redraw the C tips cleanly
for r in range(r_inner, r_outer + 1):
    bbox = [c_cx - r, c_cy - r, c_cx + r, c_cy + r]
    draw.arc(bbox, start=150, end=330, fill=pk, width=1)

# "<!" symbol to the right
sx = cx + 40

# "<" bracket
draw.line([(sx - 12, cy - 40), (sx - 32, cy), (sx - 12, cy + 40)], fill=pk2, width=6)

# "!" exclamation
draw.rounded_rectangle([(sx + 2, cy - 44), (sx + 14, cy + 14)], radius=3, fill=pk2)
draw.ellipse([(sx + 1, cy + 26), (sx + 15, cy + 40)], fill=pk2)

# ">" bracket
draw.line([(sx + 30, cy - 40), (sx + 50, cy), (sx + 30, cy + 40)], fill=pk2, width=6)

# Corner accent lines
al = 48
for (x0, y0, dx, dy) in [
    (36, 36, 1, 0), (36, 36, 0, 1),
    (SIZE-36, 36, -1, 0), (SIZE-36, 36, 0, 1),
    (36, SIZE-36, 1, 0), (36, SIZE-36, 0, -1),
    (SIZE-36, SIZE-36, -1, 0), (SIZE-36, SIZE-36, 0, -1),
]:
    draw.line([(x0, y0), (x0 + dx * al, y0 + dy * al)], fill=(*pk, 100), width=2)

# Downscale with high-quality resampling
final = img.resize((FINAL, FINAL), Image.LANCZOS)
final.save('icon-180.png', 'PNG')
print('Generated icon-180.png')
