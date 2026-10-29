"""方策モデル (どの手を選ぶか) を学習する。
入力は scripts/policy_selfplay.js が書いた _policy/*.jsonl (1行 = 1手。候補ごとの材料と、のぞき見の CPU が選んだ候補の番号 y)。
1手の候補の中で softmax をとり、選ばれた候補の確率を上げる。学習と検証は対局ごとに分ける。

    python scripts/policy_train.py --out _policy/policy.json _policy/pc_001.w*.jsonl
出力: 重み (エンジンの setAiPolicyNet にそのまま渡せる形) と、検証の当たり率
"""
import argparse
import glob
import json

import numpy as np
import torch
from torch import nn

NFLAG = 5


def load(paths):
    rows = []
    for pat in paths:
        for p in glob.glob(pat):
            for line in open(p, encoding="utf-8"):
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def build(rows, defs, maxc):
    """候補を1列に並べて持つ (手ごとに詰め物をすると大きすぎる)。I[手, 何番目] = 候補の行、M = 本物の候補か"""
    nb = len(rows[0]["b"])
    C = sum(min(len(r["c"]), maxc) for r in rows)
    B = np.zeros((len(rows), nb), np.float32)
    Dff = np.zeros((C, nb), np.float16)
    F = np.zeros((C, NFLAG), np.float32)
    K = np.full(C, len(defs), np.int64)   # 表で出すカードが無い手は最後の番号 (重みゼロの席)
    S = np.zeros(C, np.int64)
    I = np.zeros((len(rows), maxc), np.int64)
    M = np.zeros((len(rows), maxc), bool)
    Y = np.zeros(len(rows), np.int64)
    G = np.zeros(len(rows), np.int64)
    T = np.zeros(len(rows), np.int64)
    k = 0
    for r_i, r in enumerate(rows):
        B[r_i] = r["b"]
        for c_i, (diff, bits, d) in enumerate(r["c"][:maxc]):
            for i, v in diff:
                Dff[k, i] = v
            for f in range(NFLAG):
                if bits >> f & 1:
                    F[k, f] = 1
            if d is not None and d in defs:
                K[k] = defs[d]
            S[k] = r_i
            I[r_i, c_i] = k
            M[r_i, c_i] = True
            k += 1
        Y[r_i] = r["y"]
        G[r_i] = r["g"]
        T[r_i] = r["t"]
    return dict(B=B, D=Dff, F=F, K=K, S=S), I, M, Y, G, T


class Net(nn.Module):
    """1候補の点 = MLP([打つ前, 差, 手の種類, 表で出すカード])。最初の層はカードの部分だけ埋め込み (= 1-hot の重み) で持つ"""
    def __init__(self, nb, ndefs, hidden):
        super().__init__()
        self.nb, self.ndefs = nb, ndefs
        self.first = nn.Linear(nb * 2 + NFLAG, hidden[0])
        self.card = nn.Embedding(ndefs + 1, hidden[0])
        with torch.no_grad():
            self.card.weight.normal_(0, 0.01)
            self.card.weight[ndefs].zero_()
        layers, prev = [], hidden[0]
        for h in hidden[1:]:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(0.2)]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.rest = nn.Sequential(nn.ReLU(), nn.Dropout(0.2), *layers)

    def cand(self, b, d, f, k):
        h = self.first(torch.cat([b, d, f], 1)) + self.card(k) * (k < self.ndefs).unsqueeze(1)
        return self.rest(h).squeeze(1)

    def forward(self, data, I, M):
        """I, M: この組の手の候補の行。候補だけ計算して手ごとの表に戻す"""
        rows = I[M]
        b = data["B"][data["S"][rows]]
        z = self.cand(b, data["D"][rows].float(), data["F"][rows], data["K"][rows])
        out = torch.full(I.shape, -1e9, device=z.device)
        out[M] = z
        return out

    def export_layers(self):
        """エンジンの形 (1-hot のカードを入力の後ろに並べた全結合) に戻す"""
        w = torch.cat([self.first.weight, self.card.weight[:self.ndefs].t()], 1)
        lin = [(w, self.first.bias)] + [(m.weight, m.bias) for m in self.rest if isinstance(m, nn.Linear)]
        return [{"w": a.detach().cpu().numpy().round(5).tolist(), "b": c.detach().cpu().numpy().round(5).tolist()} for a, c in lin]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--out", default="_policy/policy.json")
    ap.add_argument("--hidden", default="128,64")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-4)
    a = ap.parse_args()
    rows = load(a.paths)
    rows = [r for r in rows if r["y"] < 64]
    maxc = min(64, max(len(r["c"]) for r in rows))
    defs = sorted({c[2] for r in rows for c in r["c"] if c[2] is not None})
    defs = {d: i for i, d in enumerate(defs)}
    data, I, M, Y, G, T = build(rows, defs, maxc)
    games = np.unique(G)
    rng = np.random.default_rng(1)
    va_games = set(rng.choice(games, size=len(games) * 15 // 100, replace=False).tolist())
    va = np.array([g in va_games for g in G])
    nc = M.sum(1)
    nb = data["B"].shape[1]
    print(f"手 {len(rows)} (学習 {(~va).sum()} / 検証 {va.sum()})  対局 {len(games)}  候補 平均 {nc.mean():.1f} 最大 {maxc}  入力 {nb * 2 + NFLAG + len(defs)}  カード {len(defs)}")
    print(f"でたらめに選んだときの当たり率 (検証): {np.mean(1 / nc[va]):.1%}")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    data = {k: torch.tensor(v, device=dev) for k, v in data.items()}
    torch.manual_seed(1)
    net = Net(nb, len(defs), [int(h) for h in a.hidden.split(",") if h]).to(dev)
    It, Mt, Yt = (torch.tensor(v[~va], device=dev) for v in (I, M, Y))
    Iv, Mv, Yv = (torch.tensor(v[va], device=dev) for v in (I, M, Y))
    opt = torch.optim.Adam(net.parameters(), lr=a.lr, weight_decay=a.wd)
    lossf = nn.CrossEntropyLoss()

    def predict(Ix, Mx):
        return torch.cat([net(data, Ix[i:i + 4096], Mx[i:i + 4096]) for i in range(0, len(Ix), 4096)])

    best = None
    for ep in range(a.epochs):
        net.train()
        perm = torch.randperm(len(It), device=dev)
        for i in range(0, len(It), 256):
            b = perm[i:i + 256]
            opt.zero_grad()
            loss = lossf(net(data, It[b], Mt[b]), Yt[b])
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            zv = predict(Iv, Mv)
            vl = float(lossf(zv, Yv))
            acc = float((zv.argmax(1) == Yv).float().mean())
        print(f"  周 {ep + 1}: 検証の損失 {vl:.4f}  当たり率 {acc:.1%}", flush=True)
        if best is None or vl < best[0]:
            best = (vl, ep, acc, {k: v.clone() for k, v in net.state_dict().items()})
    net.load_state_dict(best[3])
    print(f"いちばん良かった周 {best[1] + 1} / {a.epochs}  検証の損失 {best[0]:.4f}  当たり率 {best[2]:.1%}")
    net.eval()
    with torch.no_grad():
        zv = predict(Iv, Mv).cpu().numpy()
    hit = zv.argmax(1) == Y[va]
    tv = T[va]
    parts = []
    for lo, hi in ((0, 10), (10, 25), (25, 45), (45, 999)):
        m = (tv >= lo) & (tv < hi)
        if m.sum():
            parts.append(f"{lo}-{hi if hi < 999 else ''}手番 {hit[m].mean():.1%}")
    print("  " + " / ".join(parts))
    layers = net.export_layers()
    out = {"sizes": [nb * 2 + NFLAG + len(defs)] + [len(L["b"]) for L in layers], "defs": sorted(defs, key=defs.get), "layers": layers}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("書き出し: " + a.out)


if __name__ == "__main__":
    main()
