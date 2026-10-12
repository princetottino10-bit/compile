"""盤面の良し悪し (この盤面から勝つ見込み) を当てる小さなモデルを学習する。
入力は scripts/valnet_selfplay.js が書いた _valnet/*.jsonl (1行 = 1局面: x 特徴量, y 勝ったか, g 対局番号, t 手番)。
学習と検証は対局ごとに分ける (同じ対局の局面が両方に入ると、覚えただけで当たってしまう)。

    E:/SD/ComfyUI/venv/Scripts/python.exe scripts/valnet_train.py _valnet/data_001.jsonl
出力: _valnet/model.json (重み。ブラウザの素の JS で使う) と、検証の成績
"""
import json
import sys

import numpy as np
import torch
from torch import nn


def load(paths):
    X, Y, G, T = [], [], [], []
    for p in paths:
        for line in open(p, encoding="utf-8"):
            r = json.loads(line)
            X.append(r["x"]); Y.append(r["y"]); G.append(r["g"]); T.append(r["t"])
    return np.array(X, np.float32), np.array(Y, np.float32), np.array(G), np.array(T)


def auc(p, y):
    order = np.argsort(p)
    y = y[order]
    pos = y.sum(); neg = len(y) - pos
    ranks = np.arange(1, len(y) + 1)
    return float((ranks[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def report(name, p, y, t):
    eps = 1e-6
    ll = float(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)))
    acc = float(np.mean((p > 0.5) == (y > 0.5)))
    parts = []
    for lo, hi in ((0, 10), (10, 25), (25, 45), (45, 999)):
        m = (t >= lo) & (t < hi)
        if m.sum():
            parts.append(f"{lo}-{hi if hi < 999 else ''}手番 {np.mean((p[m] > 0.5) == (y[m] > 0.5)):.1%}")
    print(f"{name}: 損失 {ll:.4f}  正解率 {acc:.1%}  AUC {auc(p, y):.3f}  ({' / '.join(parts)})")


def train(model, Xtr, Ytr, Xva, epochs, lr, wd, Yva=None):
    """Yva を渡すと、毎周の検証の損失を見て、いちばん良かった周の重みに戻す (覚えすぎの前で止める)"""
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(dev)
    xt, yt = torch.tensor(Xtr, device=dev), torch.tensor(Ytr, device=dev)
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=wd)
    lossf = nn.BCEWithLogitsLoss()
    for ep in range(epochs):
        perm = torch.randperm(len(xt), device=dev)
        model.train()
        for i in range(0, len(xt), 512):
            b = perm[i:i + 512]
            opt.zero_grad()
            loss = lossf(model(xt[b]).squeeze(1), yt[b])
            loss.backward()
            opt.step()
        if Yva is not None:
            model.eval()
            with torch.no_grad():
                vl = float(lossf(model(torch.tensor(Xva, device=dev)).squeeze(1), torch.tensor(Yva, device=dev)))
            if ep == 0 or vl < best[0]:
                best = (vl, ep, {k: v.clone() for k, v in model.state_dict().items()})
    if Yva is not None:
        model.load_state_dict(best[2])
        print(f"  いちばん良かった周 {best[1] + 1} / {epochs} (検証の損失 {best[0]:.4f})")
    model.eval()
    with torch.no_grad():
        return torch.sigmoid(model(torch.tensor(Xva, device=dev)).squeeze(1)).cpu().numpy()


def main():
    X, Y, G, T = load(sys.argv[1:])
    games = np.unique(G)
    rng = np.random.default_rng(1)
    va_games = set(rng.choice(games, size=len(games) * 15 // 100, replace=False).tolist())
    va = np.array([g in va_games for g in G])
    print(f"局面 {len(X)} (学習 {(~va).sum()} / 検証 {va.sum()})  対局 {len(games)}  特徴量 {X.shape[1]}")
    report("いつも 0.5 と答える", np.full(va.sum(), 0.5, np.float32), Y[va], T[va])
    torch.manual_seed(1)
    lin = nn.Linear(X.shape[1], 1)
    report("線形 (重み付き足し算)", train(lin, X[~va], Y[~va], X[va], 15, 1e-3, 1e-5), Y[va], T[va])
    torch.manual_seed(1)
    mlp = nn.Sequential(nn.Linear(X.shape[1], 64), nn.ReLU(), nn.Dropout(0.3), nn.Linear(64, 32), nn.ReLU(), nn.Dropout(0.3), nn.Linear(32, 1))
    report("小さなネット (234→64→32→1、覚えすぎ止め)", train(mlp, X[~va], Y[~va], X[va], 30, 5e-4, 1e-3, Y[va]), Y[va], T[va])
    layers = [m for m in mlp if isinstance(m, nn.Linear)]
    out = {"sizes": [X.shape[1], 64, 32, 1],
           "layers": [{"w": l.weight.detach().cpu().numpy().round(5).tolist(), "b": l.bias.detach().cpu().numpy().round(5).tolist()} for l in layers]}
    with open("_valnet/model.json", "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("書き出し: _valnet/model.json")


if __name__ == "__main__":
    main()
