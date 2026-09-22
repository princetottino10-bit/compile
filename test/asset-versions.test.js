/* three-play.html の版 (?v=ハッシュ) が、いまのファイルの中身と合っていること。
   合っていなければ python scripts/stamp_assets.py を実行し忘れている
   (公開すると、読み直しても古いモジュールが使われることがある) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'three-play.html'), 'utf8');
/* 改行は LF にそろえてから (stamp_assets.py と同じ) */
const version = (rel) => crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, rel), 'latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex').slice(0, 10);

test('import map: js3d の全モジュールと three に、中身どおりの版が付いている', () => {
  const m = html.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/);
  assert.ok(m, 'import map がない');
  const imports = JSON.parse(m[1]).imports;
  const modules = fs.readdirSync(path.join(ROOT, 'js3d')).filter(f => f.endsWith('.js'));
  for (const f of modules) {
    assert.equal(imports['./js3d/' + f], './js3d/' + f + '?v=' + version('js3d/' + f),
      'js3d/' + f + ' の版が古い: python scripts/stamp_assets.py を実行する');
  }
  assert.equal(imports['./vendor/three.module.js'], './vendor/three.module.js?v=' + version('vendor/three.module.js'));
});

test('入口のスクリプトと CSS にも版が付いている', () => {
  assert.ok(html.includes('<script type="module" src="js3d/main.js?v=' + version('js3d/main.js') + '"></script>'), 'main.js');
  assert.ok(html.includes('<script src="engine.js?v=' + version('engine.js') + '"></script>'), 'engine.js');
  assert.ok(html.includes('href="js3d/playchoices.css?v=' + version('js3d/playchoices.css') + '"'), 'playchoices.css');
});
