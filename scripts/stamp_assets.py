# -*- coding: utf-8 -*-
"""three-play.html と、コンパニオンツール (cardlist.html / picker.html / rules.html) が読み込むスクリプト・CSS に、
中身から作った版 (?v=ハッシュ) を付ける。

GitHub Pages はどのファイルも max-age=600 で配るため、更新しても最大10分は古いものが使われ、
ページを読み直しても js3d/*.js だけ古いまま (新しい HTML + 古いモジュール) になることがある。
import map で各モジュールの URL を「中身が変わったら変わる URL」にしておけば、
HTML さえ新しければ必ず新しいモジュールが読まれる。

js3d/ や engine.js、companion.js / companion.css を変えたら、コミット前にこれを実行する
(test/asset-versions.test.js が確かめる)。
    python scripts/stamp_assets.py
"""
import glob
import hashlib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'three-play.html')
# カードリスト・ピッカー: companion.js と、それが読むアリーナの紋章・アイコンだけを使う
# (ルールの早見表は companion.css だけ。import map が無いページは CSS の版だけ付ける)
COMPANION_PAGES = ['cardlist.html', 'picker.html', 'rules.html']
COMPANION_MODULES = ['companion.js', 'js3d/emblems.js', 'js3d/icons.js']


def version(rel):
    # 改行は LF にそろえてから (Windows の作業コピーが CRLF でも、公開される中身と同じ版になるように)
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.sha1(f.read().replace(b'\r\n', b'\n')).hexdigest()[:10]


def stamped(rel):
    return './' + rel + '?v=' + version(rel)


def build_import_map():
    imports = {
        'three': stamped('vendor/three.module.js'),
        'three/addons/': './vendor/jsm/',
        './vendor/three.module.js': stamped('vendor/three.module.js'),
    }
    for path in sorted(glob.glob(os.path.join(ROOT, 'js3d', '*.js'))):
        rel = 'js3d/' + os.path.basename(path)
        imports['./' + rel] = stamped(rel)
    return json.dumps({'imports': imports}, ensure_ascii=False, indent=2)


IMPORT_RE = re.compile(r"""^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]""", re.M)


def static_graph(entry='js3d/main.js'):
    """main.js から静的 import でたどれるモジュール (動的 import は後で読むので含めない)"""
    seen, order, todo = set(), [], [entry]
    while todo:
        rel = todo.pop(0)
        if rel in seen:
            continue
        seen.add(rel)
        order.append(rel)
        src = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
        for spec in IMPORT_RE.findall(src):
            if spec == 'three':
                dep = 'vendor/three.module.js'
            elif spec.startswith('.'):
                dep = os.path.normpath(os.path.join(os.path.dirname(rel), spec)).replace(os.sep, '/')
            else:
                continue
            if os.path.exists(os.path.join(ROOT, dep)):
                todo.append(dep)
    return order


def preload_block():
    """読み込みの連鎖 (main.js → そこから import → さらに import …) を待たずに、最初から並べて取りに行く"""
    # import map に載っていないもの (three.module.js が読む three.core.js など) は版なしの URL で読まれるので、そのまま
    mapped = lambda rel: rel.startswith('js3d/') or rel == 'vendor/three.module.js'
    lines = ['<link rel="modulepreload" href="' + (stamped(rel)[2:] if mapped(rel) else rel) + '">'
             for rel in static_graph()[1:]]
    return '<!-- modulepreload:start -->\n  ' + '\n  '.join(lines) + '\n  <!-- modulepreload:end -->'


def stamp_companion(name):
    path = os.path.join(ROOT, name)
    html = io.open(path, encoding='utf-8').read()
    imports = json.dumps({'imports': {'./' + rel: stamped(rel) for rel in COMPANION_MODULES}}, ensure_ascii=False, indent=2)
    out = re.sub(r'(<script type="importmap">\s*)\{.*?\}(\s*</script>)',
                 lambda m: m.group(1) + imports.replace('\n', '\n  ') + m.group(2),
                 html, count=1, flags=re.S)
    out = re.sub(r'<link rel="stylesheet" href="companion\.css(\?v=[0-9a-f]+)?">',
                 '<link rel="stylesheet" href="companion.css?v=' + version('companion.css') + '">', out, count=1)
    if out == html:
        print(name + ': 変更なし')
        return
    io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
    print(name + ': 版を更新しました')


def main():
    for name in COMPANION_PAGES:
        stamp_companion(name)
    html = io.open(PAGE, encoding='utf-8').read()
    out = re.sub(r'(<script type="importmap">\s*)\{.*?\}(\s*</script>)',
                 lambda m: m.group(1) + build_import_map().replace('\n', '\n  ') + m.group(2),
                 html, count=1, flags=re.S)
    block = preload_block()
    if '<!-- modulepreload:start -->' in out:
        out = re.sub(r'<!-- modulepreload:start -->.*?<!-- modulepreload:end -->', lambda m: block, out, count=1, flags=re.S)
    else:
        out = re.sub(r'(<script type="importmap">.*?</script>)', lambda m: m.group(1) + '\n  ' + block, out, count=1, flags=re.S)
    out = re.sub(r'<script src="engine\.js(\?v=[0-9a-f]+)?"></script>',
                 '<script src="engine.js?v=' + version('engine.js') + '"></script>', out, count=1)
    out = re.sub(r'<link rel="stylesheet" href="js3d/playchoices\.css(\?v=[0-9a-f]+)?">',
                 '<link rel="stylesheet" href="js3d/playchoices.css?v=' + version('js3d/playchoices.css') + '">', out, count=1)
    out = re.sub(r'<script type="module" src="js3d/main\.js(\?v=[0-9a-f]+)?"></script>',
                 '<script type="module" src="js3d/main.js?v=' + version('js3d/main.js') + '"></script>', out, count=1)
    if out == html:
        print('three-play.html: 変更なし')
        return 0
    io.open(PAGE, 'w', encoding='utf-8', newline='\n').write(out)
    print('three-play.html: 版を更新しました')
    return 0


if __name__ == '__main__':
    sys.exit(main())
