# -*- coding: utf-8 -*-
"""three-play.html が読み込むスクリプト・CSS に、中身から作った版 (?v=ハッシュ) を付ける。

GitHub Pages はどのファイルも max-age=600 で配るため、更新しても最大10分は古いものが使われ、
ページを読み直しても js3d/*.js だけ古いまま (新しい HTML + 古いモジュール) になることがある。
import map で各モジュールの URL を「中身が変わったら変わる URL」にしておけば、
HTML さえ新しければ必ず新しいモジュールが読まれる。

js3d/ や engine.js を変えたら、コミット前にこれを実行する (test/asset-versions.test.js が確かめる)。
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


def main():
    html = io.open(PAGE, encoding='utf-8').read()
    out = re.sub(r'(<script type="importmap">\s*)\{.*?\}(\s*</script>)',
                 lambda m: m.group(1) + build_import_map().replace('\n', '\n  ') + m.group(2),
                 html, count=1, flags=re.S)
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
