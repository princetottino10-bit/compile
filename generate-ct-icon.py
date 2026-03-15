"""Generate control-tracker home screen icon (180x180 PNG).
   Matches the existing icon-180.png style: rounded triangle with
   3 lobe cutouts towards vertices + center circle cutout.
"""
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 540  # Render at 3x, then downscale for clean edges
OUT = 180
cx, cy_base = SIZE // 2, SIZE // 2 + 8
bg_color = (10, 10, 20)
pink = (233, 30, 140)

img = Image.new('RGBA', (SIZE, SIZE), bg_color + (255,))
draw = ImageDraw.Draw(img)

# Triangle vertices (rounded triangle approximated with polygon)
R = 220

def rounded_triangle_points(cx, cy, R, corner_r, segments=12):
    """Generate points for a rounded triangle."""
    verts = []
    for i in range(3):
        a = -math.pi / 2 + i * 2 * math.pi / 3
        verts.append((cx + R * math.cos(a), cy + R * math.sin(a)))

    points = []
    for i in range(3):
        curr = verts[i]
        next_v = verts[(i + 1) % 3]
        prev_v = verts[(i + 2) % 3]

        # Direction vectors
        to_next = (next_v[0] - curr[0], next_v[1] - curr[1])
        to_prev = (prev_v[0] - curr[0], prev_v[1] - curr[1])
        ln = math.sqrt(to_next[0]**2 + to_next[1]**2)
        lp = math.sqrt(to_prev[0]**2 + to_prev[1]**2)
        to_next = (to_next[0]/ln, to_next[1]/ln)
        to_prev = (to_prev[0]/lp, to_prev[1]/lp)

        # Offset along edges
        t = corner_r / math.tan(math.pi / 3)
        p1 = (curr[0] + to_prev[0] * t, curr[1] + to_prev[1] * t)
        p2 = (curr[0] + to_next[0] * t, curr[1] + to_next[1] * t)

        # Arc center
        bisect = (to_next[0] + to_prev[0], to_next[1] + to_prev[1])
        bl = math.sqrt(bisect[0]**2 + bisect[1]**2)
        bisect = (bisect[0]/bl, bisect[1]/bl)
        arc_cx = curr[0] + bisect[0] * corner_r / math.sin(math.pi / 3)
        arc_cy = curr[1] + bisect[1] * corner_r / math.sin(math.pi / 3)

        # Arc from p1 to p2
        a_start = math.atan2(p1[1] - arc_cy, p1[0] - arc_cx)
        a_end = math.atan2(p2[1] - arc_cy, p2[0] - arc_cx)

        # Go the short way around
        if a_end - a_start > math.pi:
            a_end -= 2 * math.pi
        elif a_start - a_end > math.pi:
            a_end += 2 * math.pi

        for s in range(segments + 1):
            frac = s / segments
            a = a_start + (a_end - a_start) * frac
            points.append((arc_cx + corner_r * math.cos(a),
                           arc_cy + corner_r * math.sin(a)))

        # Edge to next corner
        next_corner = verts[(i + 1) % 3]
        to_this = (curr[0] - next_corner[0], curr[1] - next_corner[1])
        lt = math.sqrt(to_this[0]**2 + to_this[1]**2)
        to_this = (to_this[0]/lt, to_this[1]/lt)
        edge_end = (next_corner[0] + to_this[0] * t, next_corner[1] + to_this[1] * t)
        points.append(p2)
        points.append(edge_end)

    return points

tri_points = rounded_triangle_points(cx, cy_base, R, 38)
draw.polygon(tri_points, fill=pink)

# Cut out 3 lobes towards each edge midpoint (between vertices)
# Inradius of triangle = R * cos(pi/3) = R/2; lobe must stay inside: lobe_d + lobe_r < inradius
inradius = R * 0.5  # ~110
lobe_r = 55
lobe_d = inradius - lobe_r - 2  # keep 2px margin from edge
for i in range(3):
    a = -math.pi / 2 + i * 2 * math.pi / 3 + math.pi / 3  # towards edge midpoint
    lx = cx + lobe_d * math.cos(a)
    ly = cy_base + lobe_d * math.sin(a)
    bbox = (lx - lobe_r, ly - lobe_r, lx + lobe_r, ly + lobe_r)
    draw.ellipse(bbox, fill=bg_color + (255,))

# Cut out center circle
hole_r = 44
draw.ellipse((cx - hole_r, cy_base - hole_r, cx + hole_r, cy_base + hole_r),
             fill=bg_color + (255,))

# Draw center dot (solid pink)
dot_r = 34
draw.ellipse((cx - dot_r, cy_base - dot_r, cx + dot_r, cy_base + dot_r),
             fill=pink + (255,))

# Add glow behind
glow_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_layer)
glow_tri = rounded_triangle_points(cx, cy_base, R + 15, 42)
glow_draw.polygon(glow_tri, fill=pink[:3] + (50,))
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=18))

# Composite
final = Image.new('RGBA', (SIZE, SIZE), bg_color + (255,))
final = Image.alpha_composite(final, glow_layer)
final = Image.alpha_composite(final, img)

# Downscale to 180x180 with antialiasing
result = final.resize((OUT, OUT), Image.LANCZOS)
result.save('ct-icon-180.png')
print(f'Saved ct-icon-180.png ({OUT}x{OUT})')
