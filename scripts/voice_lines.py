"""オリジナルのキャラの声を ElevenLabs で作って art/voice/<id>/ に置く。
  ストーリーの会話 (js3d/story.js の lines / winLines / loseLines) と、対戦中の一言 (js3d/avatar-lines.js)。
  鍵は環境変数 ELEVENLABS_API_KEY から読む (リポジトリには入れない)。
  作るのは足りない分だけ:
    会話  … art/voice/<id>/story/<セリフの印>.mp3 (印はセリフの文字列から作るので、直したセリフだけ作り直される)
    対戦  … art/voice/<id>/<場面>_<番号>.mp3 と manifest.json (文面を覚えておき、変わったら作り直す)
  表情 (face) は、声の感情の指示 ([sad] など) に変えて文の頭に付ける。
    python scripts/voice_lines.py shion            # 足りない分を作る
    python scripts/voice_lines.py shion --dry      # 何を作るかだけ見る
    python scripts/voice_lines.py shion --force    # 全部作り直す
"""
import json
import re
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = 'eleven_v4'
VOICES = {                                  # 本人が聞き比べて選んだ声 (2026-10-01)
    'shion': '0Q1COOYQZTkpxoapcYv0',
    'nadeshiko': 'lHjPE0jHselU3M6Jxlz1',   # 茜 (akane_cand2)
    'asagi': 'soYwBUrBkzBczmfhGexJ',       # 瑠璃 (ruri_v2_cand2。可愛らしさを増やした版の2番。本人が選んだ)
    'yamabuki': '7JE4w4Kpu7Y7q5jbZq6J',    # 杏 (anzu_v2_cand3。少年っぽさを抑えた版の3番。本人が選んだ)
}
# 表情 → 声の感情の指示。normal / blink は無し
TAGS = {'sad': '[sad]', 'shy': '[shy]', 'fired': '[determined]', 'surprised': '[surprised]', 'happy': '[gently]', 'frustrated': '[frustrated]'}
# 対戦中の場面 → 感情 (avatar.js の FACE_OF と同じ)
KIND_FACE = {'play': 'fired', 'compile': 'happy', 'compiled': 'frustrated', 'hurt': 'surprised', 'almost': 'fired', 'win': 'happy', 'lose': 'sad',
             'good': 'happy', 'down': 'fired', 'watch': 'surprised', 'chain': 'happy', 'control': 'happy', 'boost': 'fired',
             'handes': 'frustrated', 'wipe': 'fired', 'rearrange': 'fired', 'fav': 'happy', 'reach': 'fired', 'lead': 'happy', 'behind': 'frustrated',
             'crushed': 'surprised', 'recompile': 'happy', 'sure': 'fired', 'doomed': 'sad', 'ace': 'fired'}


def fnv1a(text):
    """story-ui.js の lineKey と同じ (UTF-8 の FNV-1a 32bit を 8桁の16進で)"""
    h = 0x811c9dc5
    for b in text.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return '%08x' % h


def dump(js):
    out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout)


def story_lines(who):
    """その声で読む会話の行。話す人 (who) は SPEAKERS の voice で声の id に直す (瑠璃は who が ruri、声は asagi。深淵も瑠璃の声)。
    選択肢の中の行 (choice.options[].lines と ifAgain) も拾う (2026-10-10。前は拾っておらず、選択肢のあとの会話が声なしだった)。
    「……。」のように記号だけの行は声にしない (間として、文字だけで見せる)"""
    js = ("import('./js3d/story.js').then(S=>{const o=[];const v=w=>(S.SPEAKERS[w]||{}).voice;"
          "for(const c of S.CHAPTERS)for(const n of c.nodes){const ls=[...(n.lines||[]),...(n.winLines||[]),...(n.loseLines||[])];"
          "if(n.choice)for(const op of n.choice.options)ls.push(...(op.ifAgain||[]),...(op.lines||[]));"
          "for(const l of ls)if(v(l.who)==='%s')o.push({text:l.text,face:l.face||'normal',pa:!!l.pa})}console.log(JSON.stringify(o))})" % who)
    return [l for l in dump(js) if re.sub(r'[…。、・！？!?\s]', '', l['text'])]


def battle_lines(who):
    js = "import('./js3d/avatar-lines.js').then(m=>console.log(JSON.stringify(m.LINES['%s'])))" % who
    return dump(js)


def tts(key, voice, text):
    body = json.dumps({'text': text, 'model_id': MODEL, 'language_code': 'ja'}).encode('utf-8')
    req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_96' % voice, data=body,
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return r.read()


# 読み間違える言葉は、声に渡す文だけひらがなにする (画面の文字はそのまま)。
#   「焦らなくていい」を「じらなくていい」と読んだ (2026-10-02)
READINGS = {'焦ら': 'あせら', '焦り': 'あせり', '焦る': 'あせる', '焦っ': 'あせっ',
            # 読みが2つある言葉 (点検で挙がったもの): 止め (とめ/やめ)・上回 (うわまわ)・開いた (あいた/ひらいた)・命 (いのち/めい)
            '止められ': 'とめられ', '止めらん': 'とめらん', '上回': 'うわまわ', '開いた': 'あいた',
            # 2026-10-10 の点検で挙がったもの: 解く (とく/ほどく)・開かない (あかない/ひらかない)・止める・1行・空く (あく/すく)
            '解い': 'とい', '解け': 'とけ', '開か': 'あか', '止める': 'とめる', '1行': 'いちぎょう', '空く': 'あく'}
DIGIT = ['まる', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう']


def directions(who):
    """セリフごとの演技指導 (scripts/voice_directions/<id>.json。{声の文: "[whispering]" など。"" は指示なし})。
    場面の種類で一律に決めず、セリフの中身に合わせて1本ずつ決めたもの (2026-10-04 本人)。無いセリフは表情から決める"""
    path = os.path.join(ROOT, 'scripts', 'voice_directions', who + '.json')
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}


def spoken(text, face, tag=None):
    text = text.removeprefix('〔放送〕')       # 館内放送の実況の印 (avatar.js の PA_MARK)。放送の音は鳴らすときに付ける
    for k, v in READINGS.items():
        text = text.replace(k, v)
    text = re.sub(r'命(?!令)', 'いのち', text)      # 「命」だけ (「命令」はそのまま)
    # 機体の番号 (4097・3584 など4けた) は、1字ずつ読む (よん・まる・きゅう・なな)。数 (4096体・14,203日) はそのまま
    text = re.sub(r'(?<![\d,])(\d{4})(?![\d,]|体|日|年)', lambda m: '・'.join(DIGIT[int(c)] for c in m.group(1)), text)
    text = re.sub(r'\s*[:：]\s*', '、', text)        # コロンは「コロン」と読んでしまうので、間 (ま) に置き換える (「隔離: 試験室」)
    if tag is None:
        tag = TAGS.get(face, '')
    return (tag + ' ' + text) if tag else text


def main():
    who = next((a for a in sys.argv[1:] if not a.startswith('--')), 'shion')
    dry = '--dry' in sys.argv
    force = '--force' in sys.argv
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key and not dry:
        raise SystemExit('ELEVENLABS_API_KEY がありません')
    voice = VOICES[who]
    base = os.path.join(ROOT, 'art', 'voice', who)
    os.makedirs(os.path.join(base, 'story'), exist_ok=True)
    jobs = []                                # (path, spoken text, 覚え書き)

    seen = set()
    for l in story_lines(who):
        k = fnv1a(l['text'])
        if k in seen:
            continue
        seen.add(k)
        path = os.path.join(base, 'story', k + '.mp3')
        if force or not os.path.exists(path):
            jobs.append((path, spoken(l['text'], l['face']), l['text']))

    # 台本から消えたセリフの声は消す (直したセリフの古い声が残らないように)
    for f in os.listdir(os.path.join(base, 'story')):
        if f.endswith('.mp3') and f[:-4] not in seen:
            print('  消す', f)
            if not dry:
                os.remove(os.path.join(base, 'story', f))

    mpath = os.path.join(base, 'manifest.json')
    manifest = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {}
    direct = directions(who)
    for kind, arr in battle_lines(who).items():
        for i, entry in enumerate(arr):
            text = entry[1] if isinstance(entry, list) else entry
            if '{' in text:
                continue                     # 札の名前が入る文は声にできない (表示だけ)
            name = '%s_%d.mp3' % (kind, i)
            path = os.path.join(base, name)
            tag = direct.get(text)
            said = spoken(text, KIND_FACE.get(kind, 'fired' if kind.startswith('own_') else 'normal'), tag)
            # 覚えておくのは、指示も含めた声の文 (指示を変えたら作り直す)
            if force or not os.path.exists(path) or manifest.get(name) not in (said, text if tag is None else None):
                jobs.append((path, said, text))
                manifest[name] = said

    chars = sum(len(t) for _, t, _ in jobs)
    print('%d 件 / %d 文字' % (len(jobs), chars))
    for path, t, raw in jobs:
        print(' ', os.path.relpath(path, ROOT), '|', t)
    if dry:
        return
    for n, (path, t, raw) in enumerate(jobs, 1):
        data = tts(key, voice, t)
        with open(path, 'wb') as f:
            f.write(data)
        print('%d/%d' % (n, len(jobs)), os.path.relpath(path, ROOT), len(data) // 1024, 'KB', flush=True)
    json.dump(manifest, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
