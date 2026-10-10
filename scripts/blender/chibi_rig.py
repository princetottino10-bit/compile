"""ちびキャラ共通の人形 (2.5 頭身) と、主人公 (機体4097) の3Dモデル。Blender 4.5 で、画面を開かずに動かす:

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" -b --python scripts/blender/chibi_rig.py -- <やること>

やること:
    hero      主人公の3Dモデルを art/models/hero4097.glb に書き出す (歩ける地図で使う。js3d/story-world.js)
    preview   主人公を4方向からレンダリングして、見た目を確かめる絵を出す
    base      ちびキャラの下絵 (素の人形の線画と陰影) を 9枚 (正面・横・後ろ × 立ち・歩き2コマ) 書き出す。
              イラスト用セッションが ControlNet の下絵にして、5体の体型と歩きのコマをそろえる

座標: Blender は Z が上、キャラの正面は -Y。glTF に書き出すと Y が上・正面が +Z になる (three.js でそのまま前を向く)。
背丈 1.6 (地図の1マスは 2)。頭は高さの 4割 (2.5 頭身)。
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_SD = r'E:\SD\SwarmUI\Output'

H = 1.6
HEAD_R = 0.32
HEAD_Z = H - HEAD_R            # 頭の真ん中
HIP_Z = 0.52                   # 足の付け根
SHOULDER_Z = 0.86
LEG_LEN = 0.44
ARM_LEN = 0.34

WHITE = (0.86, 0.88, 0.91, 1)
NAVY = (0.055, 0.075, 0.11, 1)
CYAN = (0.44, 0.94, 1.0, 1)
GRAY = (0.6, 0.6, 0.62, 1)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, emission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = 0.55
    if emission:
        b.inputs['Emission Color'].default_value = color
        b.inputs['Emission Strength'].default_value = emission
    return m


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def blob(name, size, loc, mat, parent=None, origin_top=False, segments=24):
    """楕円の玉。origin_top: 原点を玉の上の端に置く (足・腕を付け根で回すため)"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=1)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    for v in o.data.vertices:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2] - (size[2] if origin_top else 0)))
    o.location = loc
    o.data.materials.append(mat)
    smooth(o)
    if parent:
        o.parent = parent
        o.location = Vector(loc) - parent.matrix_world.translation
    return o


def build(hero=True):
    """人形を組み立てる。hero=True なら主人公の外套・フード・胸の灯を着せる"""
    skin = material('Body', WHITE if hero else GRAY)
    dark = material('Navy', NAVY)
    root = bpy.data.objects.new('Hero', None)
    bpy.context.scene.collection.objects.link(root)
    parts = {}
    parts['Torso'] = blob('Torso', (0.19, 0.14, 0.25), (0, 0, 0.74), skin)
    parts['Neck'] = blob('Neck', (0.06, 0.06, 0.08), (0, 0, 0.98), skin)
    parts['Pelvis'] = blob('Pelvis', (0.17, 0.13, 0.1), (0, 0, 0.55), skin)
    parts['Head'] = blob('Head', (HEAD_R * 1.04, HEAD_R * 0.96, HEAD_R), (0, 0, HEAD_Z), dark if hero else skin, segments=32)
    for side, x in (('L', 0.085), ('R', -0.085)):
        leg = blob('Leg' + side, (0.08, 0.08, LEG_LEN / 2), (x, 0, HIP_Z), skin, origin_top=True)
        shoe = blob('Shoe' + side, (0.08, 0.11, 0.05), (x, -0.025, HIP_Z - LEG_LEN + 0.02), dark if hero else skin)
        shoe.parent = leg
        shoe.matrix_parent_inverse = leg.matrix_world.inverted()
        arm = blob('Arm' + side, (0.062, 0.062, ARM_LEN / 2), (x * 2.2, 0, SHOULDER_Z), skin, origin_top=True)
        hand = blob('Hand' + side, (0.06, 0.06, 0.06), (x * 2.2, 0, SHOULDER_Z - ARM_LEN), skin)
        hand.parent = arm
        hand.matrix_parent_inverse = arm.matrix_world.inverted()
        parts['Leg' + side], parts['Arm' + side] = leg, arm
    if hero:
        import bmesh
        # 外套: 首から肩へ広がり、すそへ向かって鐘の形に開く。断面 (半径, 高さ) を Z 軸のまわりに回して作る。底は開ける
        prof = [(0.10, 1.00), (0.17, 0.97), (0.25, 0.92), (0.27, 0.86), (0.28, 0.74), (0.31, 0.58), (0.36, 0.42), (0.40, 0.31)]
        me = bpy.data.meshes.new('Cloak')
        bm = bmesh.new()
        vs = [bm.verts.new((r, 0, z)) for r, z in prof]
        es = [bm.edges.new((vs[k], vs[k + 1])) for k in range(len(vs) - 1)]
        bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=64, use_merge=True)
        bm.to_mesh(me)
        bm.free()
        cloak = bpy.data.objects.new('Cloak', me)
        bpy.context.scene.collection.objects.link(cloak)
        cloak.data.materials.append(skin)
        sol = cloak.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.018
        sub = cloak.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
        smooth(cloak)
        parts['Cloak'] = cloak
        # フード: 頭を包む布。後ろの上を少しとがらせる (外形の目印)。正面は楕円にくり抜き、中の暗い頭 (顔のない影) が見える
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=HEAD_R * 1.12, location=(0, 0, HEAD_Z + 0.02))
        hood = bpy.context.active_object
        hood.name = 'Hood'
        for v in hood.data.vertices:
            back = max(0.0, v.co.y) / (HEAD_R * 1.12)
            up = max(0.0, v.co.z) / (HEAD_R * 1.12)
            v.co.y += (back * up) ** 1.5 * 0.12   # 後ろ上へ、なだらかにとがる
            v.co.z += (back * up) ** 1.5 * 0.04
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(0, -0.33, HEAD_Z - 0.03))
        cutter = bpy.context.active_object
        cutter.scale = (0.25, 0.28, 0.27)
        bo = hood.modifiers.new('cut', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter
        bpy.context.view_layer.objects.active = hood
        bpy.ops.object.modifier_apply(modifier='cut')
        bpy.data.objects.remove(cutter)
        hood.data.materials.append(skin)
        sol = hood.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.03
        smooth(hood)
        parts['Hood'] = hood
        parts['Head'].scale = (0.94, 0.94, 0.94)    # 中の頭は少し小さく、奥へ (影に見える)
        parts['Head'].location.y += 0.03
        # 袖口は紺。腕は外套の脇から出す
        for side, sx in (('L', 1), ('R', -1)):
            parts['Arm' + side].location.x = sx * 0.335    # 肩は外套の外。腕は外套の脇に垂れる
            parts['Arm' + side].location.y = -0.02
        # 胸の灯
        parts['Core'] = blob('Core', (0.035, 0.02, 0.035), (0, -0.272, 0.8), material('Core', CYAN, emission=6.0))
        for k in ('Torso', 'Neck', 'Pelvis'):
            bpy.data.objects.remove(parts.pop(k))       # 外套の下で見えない
    for o in parts.values():
        if o.parent is None:
            o.parent = root
    return root, parts


def pose(parts, frame):
    """stand / walk1 (右足と左腕が前) / walk2 (左足と右腕が前)。正面は -Y なので、前へ振るのは X 軸の負の回転"""
    a = {'stand': 0, 'walk1': 1, 'walk2': -1}[frame] * math.radians(28)
    parts['LegR'].rotation_euler = (-a, 0, 0)
    parts['LegL'].rotation_euler = (a, 0, 0)
    # 後ろへ蹴った足は少し縮めて、かかとを浮かせる (正面から見ても、どちらの足が前か分かる)
    parts['LegR'].scale = (1, 1, 0.9 if a < 0 else 1)
    parts['LegL'].scale = (1, 1, 0.9 if a > 0 else 1)
    parts['ArmL'].rotation_euler = (-a * 0.8, 0, math.radians(0))
    parts['ArmR'].rotation_euler = (a * 0.8, 0, 0)
    out = math.radians(13) if 'Cloak' in parts else math.radians(8)   # 外套の上に腕を出す
    parts['ArmL'].rotation_euler[1] = out
    parts['ArmR'].rotation_euler[1] = -out


def camera_and_light(world_color=(0.04, 0.05, 0.07, 1), ortho=2.1):
    scn = bpy.context.scene
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scn.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    cam.location = (0, -6, H / 2 + 0.02)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scn.camera = cam
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    scn.collection.objects.link(sun)
    w = bpy.data.worlds.new('W')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = world_color
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    scn.world = w
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    return cam


def render(path, size):
    scn = bpy.context.scene
    scn.render.resolution_x = scn.render.resolution_y = size
    scn.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)


def do_hero():
    reset()
    build(hero=True)
    out = os.path.join(ROOT, 'art', 'models', 'hero4097.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                              export_animations=False, export_materials='EXPORT')
    print('wrote', out, os.path.getsize(out))


def do_preview():
    reset()
    root, parts = build(hero=True)
    camera_and_light()
    for name, rz, fr in (('front', 0, 'stand'), ('side', 90, 'walk1'), ('back', 180, 'stand'), ('q34', 35, 'walk2')):
        root.rotation_euler = (0, 0, math.radians(rz))
        pose(parts, fr)
        render(os.path.join(OUT_SD, 'blender', 'hero4097_' + name + '.png'), 512)


def do_base():
    """素の人形の下絵。線 (Freestyle) と陰影、透明の背景。5体のちびキャラの体型と歩きをそろえるため"""
    reset()
    root, parts = build(hero=False)
    camera_and_light(world_color=(1, 1, 1, 1))
    scn = bpy.context.scene
    scn.render.film_transparent = True
    scn.render.use_freestyle = True
    scn.render.line_thickness_mode = 'ABSOLUTE'
    vl = scn.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('Lines')
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('Line')
    ls.linestyle.thickness = 3.0
    ls.linestyle.color = (0, 0, 0)
    for dir_, rz in (('front', 0), ('side', 90), ('back', 180)):
        root.rotation_euler = (0, 0, math.radians(rz))
        for fr in ('stand', 'walk1', 'walk2'):
            pose(parts, fr)
            render(os.path.join(OUT_SD, 'chibi_base', 'base_' + dir_ + '_' + fr + '.png'), 1024)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['hero']
    for a in args:
        {'hero': do_hero, 'preview': do_preview, 'base': do_base}[a]()
