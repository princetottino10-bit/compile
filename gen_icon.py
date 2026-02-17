"""Generate apple-touch-icon featuring the Control Marker design.

Original shape analysis:
- Rounded triangle pointing up
- 3 wide trapezoidal cutouts from each EDGE MIDPOINT toward center
- The cutouts are wide at the edge, narrow toward center
- This leaves 3 thick arms at each VERTEX
- Dark circle in the center
"""
from PIL import Image, ImageDraw
import math

SIZE = 720
FINAL = 180

bg = (10, 10, 18)
pk = (233, 30, 140)
inner_bg = (16, 13, 24)

cx, cy = SIZE // 2, SIZE // 2 + 8

tri_r = 275
corner_round = 60

def pt_at(angle_deg, r):
    a = math.radians(angle_deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))

# Vertices: up, bottom-right, bottom-left
vert_angles = [-90, 30, 150]
verts = [pt_at(a, tri_r) for a in vert_angles]
# Edge midpoint angles
mid_angles = [-30, 90, 210]

def rounded_poly(d, verts, r, fill):
    n = len(verts)
    pts = []
    for i in range(n):
        prev = verts[(i-1)%n]; curr = verts[i]; nxt = verts[(i+1)%n]
        v1 = (prev[0]-curr[0], prev[1]-curr[1])
        v2 = (nxt[0]-curr[0], nxt[1]-curr[1])
        l1 = math.hypot(*v1); l2 = math.hypot(*v2)
        v1n = (v1[0]/l1, v1[1]/l1); v2n = (v2[0]/l2, v2[1]/l2)
        t1 = (curr[0]+v1n[0]*r, curr[1]+v1n[1]*r)
        t2 = (curr[0]+v2n[0]*r, curr[1]+v2n[1]*r)
        bx = v1n[0]+v2n[0]; by = v1n[1]+v2n[1]
        bl = math.hypot(bx, by)
        if bl < 0.001: pts.extend([t1, t2]); continue
        bx/=bl; by/=bl
        dot = max(-1, min(1, v1n[0]*v2n[0]+v1n[1]*v2n[1]))
        half = math.acos(dot)/2
        cd = r/math.sin(half) if math.sin(half)>0.001 else r
        center = (curr[0]+bx*cd, curr[1]+by*cd)
        arc_r = math.hypot(t1[0]-center[0], t1[1]-center[1])
        a1 = math.atan2(t1[1]-center[1], t1[0]-center[0])
        a2 = math.atan2(t2[1]-center[1], t2[0]-center[0])
        cross = v1n[0]*v2n[1]-v1n[1]*v2n[0]
        if cross>0:
            while a2>a1: a2-=2*math.pi
        else:
            while a2<a1: a2+=2*math.pi
        pts.append(t1)
        for s in range(1,20):
            a=a1+(a2-a1)*s/20
            pts.append((center[0]+arc_r*math.cos(a), center[1]+arc_r*math.sin(a)))
        pts.append(t2)
    d.polygon(pts, fill=fill)

# Step 1: Outer triangle mask
tri_mask = Image.new('L', (SIZE, SIZE), 0)
rounded_poly(ImageDraw.Draw(tri_mask), verts, corner_round, 255)

# Step 2: 3 trapezoidal notches from edge midpoints toward center
notch_mask = Image.new('L', (SIZE, SIZE), 0)
nd = ImageDraw.Draw(notch_mask)

for i in range(3):
    ma = math.radians(mid_angles[i])
    # Edge midpoint
    mid = pt_at(mid_angles[i], tri_r * math.cos(math.radians(30)))  # distance to edge midpoint

    # Direction: outward from center
    nx = math.cos(ma)
    ny = math.sin(ma)
    # Tangent along edge
    tx = -ny
    ty = nx

    # Outer edge of notch (at triangle edge) - WIDE
    out_w = 120  # half-width
    out_pt = mid  # at edge
    o1 = (out_pt[0] + tx * out_w, out_pt[1] + ty * out_w)
    o2 = (out_pt[0] - tx * out_w, out_pt[1] - ty * out_w)

    # Inner edge of notch (near center) - NARROW
    in_w = 42
    in_depth = 170  # how far from edge toward center
    in_pt = (mid[0] - nx * in_depth, mid[1] - ny * in_depth)
    i1 = (in_pt[0] + tx * in_w, in_pt[1] + ty * in_w)
    i2 = (in_pt[0] - tx * in_w, in_pt[1] - ty * in_w)

    nd.polygon([o1, o2, i2, i1], fill=255)

# Center circle
circle_r = 60
nd.ellipse([(cx-circle_r, cy-circle_r), (cx+circle_r, cy+circle_r)], fill=255)

# Step 3: Marker = triangle minus notches
from PIL import ImageChops
marker_mask = ImageChops.subtract(tri_mask, notch_mask)

# Step 4: Render
result = Image.new('RGB', (SIZE, SIZE), bg)
rd = ImageDraw.Draw(result, 'RGBA')

# Subtle glow
for g in range(20, 0, -1):
    alpha = int(4 * g / 20)
    gv = [pt_at(a, tri_r + g*3) for a in vert_angles]
    rd.polygon(gv, fill=(233, 30, 140, alpha))

# Pink marker
pink = Image.new('RGB', (SIZE, SIZE), pk)
result.paste(pink, mask=marker_mask)

# Dark fill in cutouts (within triangle)
inner_fill = ImageChops.multiply(tri_mask, notch_mask)
result.paste(Image.new('RGB', (SIZE, SIZE), inner_bg), mask=inner_fill)

# Downscale
final = result.resize((FINAL, FINAL), Image.LANCZOS)
final.save('icon-180.png', 'PNG')
print('Generated icon-180.png')
