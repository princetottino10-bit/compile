"""ぱうぷるの棋譜から「ぱうぷるならどの手を選ぶか」を学ぶ (手の好みの補正)。
入力は scripts/paupuru_compare.js --features が書いた _paupuru/compare.jsonl
(1行 = ぱうぷるの1手番: ORACLE の根の候補ごとの評価 val、指した後の盤面の特徴 f、手の形 d、ぱうぷるが選んだか)。

ORACLE の評価を土台にして、それで説明しきれないぶんだけを手の特徴で足す条件付きロジット:
    P(手 i) ∝ exp(a · r_i + w · φ_i)   (r_i は ORACLE の評価での順位を -log(1+順位) にしたもの)
φ は手の形 (表か裏か・リフレッシュ・カードの値・プロトコル・自分のプロトコルのラインか・覆う札・ラインの点数) と、
指した後の盤面の特徴 (valnet と同じ 234 個) のうち手の間で差の出るもの。
M0 (評価の順位だけ) と M1 (+ 手の形)・M2 (+ 盤面) を、局ごとに分けた5分割で比べる (同じ局の手番が学習と検証の両方に入ると、覚えただけで当たる)。

    python3 scripts/paupuru_train.py _paupuru/compare.jsonl
出力: 検証の一致率・対数尤度と、効いている特徴の上位。--save で _paupuru/style.json (全データで学習した w)
numpy だけで動く。
"""
import json
import sys

import numpy as np

PROTOS = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER',
          'APATHY', 'HATE', 'LOVE', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE', 'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME',
          'WAR', 'ASSIMILATION', 'DIVERSITY', 'UNITY']
CLIP = 3000.0   # 評価の無い手 (人の手が候補外) を最下位に並べるための値


def action_names():
    n = ['refresh', 'facedown', 'own_line', 'compiled_line', 'covers_up', 'covers_down', 'mine_after_ge10', 'mine_lead',
         'hand_small_refresh']
    n += ['val%d_up' % v for v in range(7)] + ['val%d_down' % v for v in range(7)]
    n += ['%s_up' % p for p in PROTOS]
    return n


def action_feat(d):
    x = np.zeros(len(action_names()))
    if d.get('refresh'):
        x[0] = 1
        x[8] = 1 if d.get('hand', 5) <= 2 else 0
        return x
    up = d['up']
    proto, val = d['def'].rsplit('_', 1)[0], d['def'].rsplit('_', 1)[1]
    try:
        v = max(0, min(6, int(val) - 1))   # def の番号は値 + 1
    except ValueError:
        v = 0
    x[1] = 0 if up else 1
    x[2] = d.get('own', 0)
    x[3] = d.get('compiled', 0)
    x[4] = 1 if d.get('cover') not in (None, 'down') else 0
    x[5] = 1 if d.get('cover') == 'down' else 0
    after = d['mine'] + (v if up else 2)
    x[6] = 1 if after >= 10 else 0
    x[7] = 1 if after > d['theirs'] else 0
    x[9 + v + (0 if up else 7)] = 1
    if up and proto in PROTOS:
        x[23 + PROTOS.index(proto)] = 1
    return x


def load(path):
    turns = []
    for line in open(path, encoding='utf-8'):
        r = json.loads(line)
        fs = [c for c in r['feats'] if c['f'] is not None]
        if len(fs) < 2 or not any(c['human'] for c in fs):
            continue
        val = np.array([np.clip(c['val'] if c['val'] is not None else -CLIP, -CLIP, CLIP) for c in fs], dtype=float)
        A = np.stack([action_feat(c['d']) for c in fs])
        B = np.array([c['f'] for c in fs], dtype=float)
        y = int(np.argmax([c['human'] for c in fs]))
        turns.append({'n': r['n'], 'val': val, 'A': A, 'B': B, 'y': y, 'acts': [c['act'] for c in fs]})
    return turns


def stack(turns, use_board):
    """手番ごとに候補数の違う表を、詰めた配列 (足りないところは mask で消す) にまとめる"""
    K = max(len(t['val']) for t in turns); N = len(turns)
    D = len(action_names()) + (turns[0]['B'].shape[1] if use_board else 0)
    V = np.zeros((N, K)); X = np.zeros((N, K, D)); M = np.zeros((N, K), bool); Y = np.zeros(N, int)
    for i, t in enumerate(turns):
        k = len(t['val'])
        # 評価点の大きさは局面で桁が変わる (確定勝ちの ±1e9 もある) ので、順位で渡す: 最善 0、次 -log2、…
        V[i, :k] = -np.log1p(np.argsort(np.argsort(-t['val'])))
        A = t['A'] if not use_board else np.concatenate([t['A'], t['B'] - t['B'].mean(axis=0)], axis=1)   # 盤面は手の間の差だけが効く
        X[i, :k] = A; M[i, :k] = True; Y[i] = t['y']
    return V, X, M, Y


def scores(th, V, X, M, use_feats):
    s = th[0] * V + (X @ th[1:] if use_feats else 0)
    s = np.where(M, s, -1e9)
    return s - s.max(axis=1, keepdims=True)


def fit(V, X, M, Y, use_feats, l2, iters=1500, lr=0.1):
    """条件付きロジットを Adam で。パラメータ: [評価の順位の重み, w...]"""
    th = np.zeros(1 + X.shape[2]); th[0] = 1.0
    m = np.zeros_like(th); v = np.zeros_like(th)
    for it in range(1, iters + 1):
        p = np.exp(scores(th, V, X, M, use_feats)); p /= p.sum(axis=1, keepdims=True)
        e = -p; e[np.arange(len(Y)), Y] += 1; e *= M
        g = np.zeros_like(th)
        g[0] = (e * V).sum() / len(Y)
        if use_feats:
            g[1:] = np.einsum('nk,nkd->d', e, X) / len(Y) - l2 * th[1:]
        m = 0.9 * m + 0.1 * g; v = 0.999 * v + 0.001 * g * g
        th += lr * (m / (1 - 0.9 ** it)) / (np.sqrt(v / (1 - 0.999 ** it)) + 1e-8)
    return th


def evaluate(th, V, X, M, Y, use_feats):
    s = scores(th, V, X, M, use_feats)
    lp = s - np.log(np.exp(s).sum(axis=1, keepdims=True))
    return lp[np.arange(len(Y)), Y].sum(), (s.argmax(axis=1) == Y).sum()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args else '_paupuru/compare.jsonl'
    turns = load(path)
    G = np.array([t['n'] for t in turns])
    games = np.unique(G)
    print(f'手番 {len(turns)} / 局 {len(games)}')
    order = np.random.default_rng(1).permutation(games)
    folds = [np.isin(G, order[i::5]) for i in range(5)]
    configs = [('M0 評価の順位だけ', False, False, 0.0), ('M1 +手の形', True, False, 0.01), ('M2 +手の形+盤面', True, True, 0.05)]
    for name, uf, ub, l2 in configs:
        V, X, M, Y = stack(turns, ub)
        ll = hit = 0
        for f in folds:
            th = fit(V[~f], X[~f], M[~f], Y[~f], uf, l2)
            a, b = evaluate(th, V[f], X[f], M[f], Y[f], uf)
            ll += a; hit += b
        print(f'{name}: 検証の一致 {100 * hit / len(turns):.1f}% 対数尤度 {ll / len(turns):.3f}')
    V, X, M, Y = stack(turns, False)
    th = fit(V, X, M, Y, True, 0.01)
    names = action_names()
    print(f'評価の順位の重み = {th[0]:.2f}')
    for k, w in sorted(zip(names, th[1:]), key=lambda x: -abs(x[1]))[:20]:
        print(f'  {k:22s} {w:+.3f}')
    if '--save' in sys.argv:
        json.dump({'rankW': th[0], 'names': names, 'w': list(th[1:])}, open('_paupuru/style.json', 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main()
