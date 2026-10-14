"""コンボ学習: 「自分の持ち札のどの2枚が同時にあると勝ちやすいか」を学ぶ。
入力は scripts/combo_selfplay.js が書いた _combo/*.jsonl (1行 = 1局面: k トークン, s 点数, y 勝ったか, g 対局番号)。

今の CPU の点数 (aiScore) を土台にして、それで説明しきれないぶんだけをカードの組み合わせで足す形 (factorization machine):
    ロジット = a * 点数/100 + b + Σ 1枚ずつの重み + Σ_{2枚の組} <v_i, v_j>
<v_i, v_j> が「その2枚が同時にある」ことの得 (組み合わせの値)。カードごとに短いベクトル v を持たせるので、
一緒に出た回数が少ない組でも、似たカードから値を推せる。

3つを同じ分け方で比べて、組み合わせの項が検証で効いているかを見る:
    M0 点数だけ / M1 + 1枚ずつ / M2 + 組み合わせ
学習と検証は対局ごとに分ける (同じ対局の局面が両方に入ると、覚えただけで当たってしまう)。

    python3 scripts/combo_train.py _combo/data_*.jsonl
出力: _combo/model.json (M2 の重み) と、組み合わせの値の上位 (_combo/pairs.txt)
numpy だけで動く (torch は要らない)。
"""
import json
import sys

import numpy as np


def load(paths):
    rows = []
    for p in paths:
        for line in open(p, encoding="utf-8"):
            if line.strip():
                rows.append(json.loads(line))
    return rows


def auc(p, y):
    order = np.argsort(p)
    y = y[order]
    pos = y.sum(); neg = len(y) - pos
    ranks = np.arange(1, len(y) + 1)
    return float((ranks[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def logloss(p, y):
    eps = 1e-7
    return float(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)))


class FM:
    """点数 + 1枚ずつ + 組み合わせ。use_lin / use_pair で段階を切り替える"""

    def __init__(self, n_tok, k, use_lin, use_pair, seed):
        rng = np.random.default_rng(seed)
        self.a = np.zeros(1); self.b = np.zeros(1)
        self.w = np.zeros(n_tok)
        self.v = rng.normal(0, 0.01, (n_tok, k))
        self.use_lin, self.use_pair = use_lin, use_pair

    def params(self):
        return [self.a, self.b, self.w, self.v]

    def forward(self, S, T, M):
        z = self.a[0] * S + self.b[0]
        if self.use_lin:
            z = z + (self.w[T] * M).sum(1)
        if self.use_pair:
            V = self.v[T] * M[:, :, None]            # (N, L, k)
            s = V.sum(1)
            z = z + 0.5 * ((s * s).sum(1) - (V * V).sum((1, 2)))
        return z

    def grads(self, S, T, M, g):
        """g = dLoss/dz (N,)"""
        ga = np.array([(g * S).mean()]); gb = np.array([g.mean()])
        gw = np.zeros_like(self.w); gv = np.zeros_like(self.v)
        n = len(g)
        if self.use_lin:
            np.add.at(gw, T[M > 0], np.broadcast_to(g[:, None], T.shape)[M > 0] / n)
        if self.use_pair:
            V = self.v[T] * M[:, :, None]
            s = V.sum(1)                                   # (N, k)
            d = (s[:, None, :] - V) * g[:, None, None] / n  # (N, L, k)
            np.add.at(gv, T[M > 0], d[M > 0])
        return [ga, gb, gw, gv]


def fit(model, data, va, epochs, lr, l2w, l2v, bs=1024, seed=1):
    S, T, M, Y = data
    tr = np.where(~va)[0]
    rng = np.random.default_rng(seed)
    P = model.params()
    m1 = [np.zeros_like(p) for p in P]; m2 = [np.zeros_like(p) for p in P]
    step = 0
    best = (np.inf, None, -1)
    for ep in range(epochs):
        rng.shuffle(tr)
        for i in range(0, len(tr), bs):
            b = tr[i:i + bs]
            z = model.forward(S[b], T[b], M[b])
            g = 1 / (1 + np.exp(-z)) - Y[b]
            G = model.grads(S[b], T[b], M[b], g)
            G[2] = G[2] + l2w * model.w
            G[3] = G[3] + l2v * model.v
            step += 1
            for j, (p, gr) in enumerate(zip(P, G)):
                m1[j] = 0.9 * m1[j] + 0.1 * gr
                m2[j] = 0.999 * m2[j] + 0.001 * gr * gr
                p -= lr * (m1[j] / (1 - 0.9 ** step)) / (np.sqrt(m2[j] / (1 - 0.999 ** step)) + 1e-8)
        pv = 1 / (1 + np.exp(-model.forward(S[va], T[va], M[va])))
        vl = logloss(pv, Y[va])
        if vl < best[0]:
            best = (vl, [p.copy() for p in P], ep)
    for p, q in zip(P, best[1]):
        p[...] = q
    pv = 1 / (1 + np.exp(-model.forward(S[va], T[va], M[va])))
    return pv, best[2] + 1


def main():
    rows = load(sys.argv[1:])
    vocab = {}
    for r in rows:
        for t in r["k"]:
            vocab.setdefault(t, len(vocab) + 1)       # 0 は詰め物
    L = max(len(r["k"]) for r in rows)
    N = len(rows)
    T = np.zeros((N, L), np.int64); M = np.zeros((N, L))
    for i, r in enumerate(rows):
        ids = [vocab[t] for t in r["k"]]
        T[i, :len(ids)] = ids; M[i, :len(ids)] = 1
    S = np.array([r["s"] for r in rows], float) / 100
    Y = np.array([r["y"] for r in rows], float)
    G = np.array([r["g"] for r in rows])
    games = np.unique(G)
    rng = np.random.default_rng(1)
    perm = rng.permutation(games)
    n15 = len(games) * 15 // 100
    va_games, te_games = set(perm[:n15].tolist()), set(perm[n15:2 * n15].tolist())
    va = np.array([g in va_games for g in G])
    te = np.array([g in te_games for g in G])
    print(f"局面 {N} (学習 {(~va & ~te).sum()} / 選ぶ用 {va.sum()} / 試験 {te.sum()})  対局 {len(games)}  トークン {len(vocab)} 種  1局面の最大 {L}")
    print(f"いつも勝率どおり: 試験の損失 {logloss(np.full(te.sum(), Y[~va & ~te].mean()), Y[te]):.4f}")
    res = {}
    # 正則化の強さは「選ぶ用」で決め、成績は一度も見ていない「試験」で出す (選んだ側で測ると甘く出る)
    for name, lin, pair, grid in (("M0 点数だけ", False, False, [(1e-4, 1e-4)]),
                                  ("M1 + 1枚ずつ", True, False, [(1e-4, 1e-4), (1e-3, 1e-4), (1e-2, 1e-4)]),
                                  ("M2 + 組み合わせ", True, True, [(l2w, l2v) for l2w in (1e-4, 1e-3) for l2v in (1e-3, 3e-3, 1e-2, 3e-2)])):
        best = None
        for l2w, l2v in grid:
            m = FM(len(vocab) + 1, 8, lin, pair, seed=1)
            pv, ep = fit(m, (S[~te], T[~te], M[~te], Y[~te]), va[~te], epochs=30, lr=3e-3, l2w=l2w, l2v=l2v)
            vl = logloss(pv, Y[~te][va[~te]])
            if best is None or vl < best[0]:
                best = (vl, m, ep, l2w, l2v)
        vl, m, ep, l2w, l2v = best
        pt = 1 / (1 + np.exp(-m.forward(S[te], T[te], M[te])))
        res[name] = m
        print(f"{name}: 試験の損失 {logloss(pt, Y[te]):.4f}  AUC {auc(pt, Y[te]):.4f}  (選ぶ用 {vl:.4f}、周 {ep}、正則化 {l2w:g}/{l2v:g})  点数の係数 {m.a[0]:.3f}")
    va = va | te

    m = res["M2 + 組み合わせ"]
    inv = {i: t for t, i in vocab.items()}
    # 学習側で一緒に出た回数 (少ない組の値は当てにならない)
    co = {}
    for i in np.where(~va)[0]:
        ids = sorted(set(T[i][M[i] > 0].tolist()))
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                co[(ids[x], ids[y])] = co.get((ids[x], ids[y]), 0) + 1
    pairs = [(float(m.v[a] @ m.v[b]), n, inv[a], inv[b]) for (a, b), n in co.items() if n >= 40]
    pairs.sort(reverse=True)
    lines = [f"{val:+.3f}  {n:5d}回  {a}  {b}" for val, n, a, b in pairs]
    with open("_combo/pairs.txt", "w", encoding="utf-8") as f:
        f.write("組み合わせの値 (ロジット)  学習側で一緒に出た回数  札1  札2\n" + "\n".join(lines) + "\n")
    print("組み合わせの値の上位 (一緒に40回以上):")
    for s in lines[:25]:
        print("  " + s)
    print("下位:")
    for s in lines[-10:]:
        print("  " + s)
    out = {"k": m.v.shape[1], "a": float(m.a[0]), "b": float(m.b[0]),
           "tokens": {t: {"w": round(float(m.w[i]), 5), "v": [round(float(x), 5) for x in m.v[i]]} for t, i in vocab.items()}}
    with open("_combo/model.json", "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("書き出し: _combo/model.json, _combo/pairs.txt")


if __name__ == "__main__":
    main()
