"""学習モデル (盤面の良し悪し) を、これまでのデータを全部まとめて大きなネットで学習する。
第2版・第3版の特徴量は先頭の 234 個が第1版と同じなので、そこだけを使う。方策のデータ (policy_selfplay.js) は b と w を使う。
学習と検証は (ファイル, 対局) ごとに分ける。

    python scripts/valnet_train_big.py --hidden 512,256,128 --out _big/model.json DIR/*.jsonl
"""
import argparse
import glob
import json
import os

import numpy as np
import torch
from torch import nn

NB = 234


def load(paths, cache):
    if cache and os.path.exists(cache):
        z = np.load(cache)
        return z["X"], z["Y"], z["G"], z["T"]
    X, Y, G, T = [], [], [], []
    files = sorted({f for p in paths for f in glob.glob(p)})
    for fi, p in enumerate(files):
        n0 = len(Y)
        for line in open(p, encoding="utf-8"):
            if not line.strip():
                continue
            r = json.loads(line)
            if "b" in r:
                X.append(r["b"]); Y.append(r["w"])
            else:
                X.append(r["x"][:NB]); Y.append(r["y"])
            G.append(fi * 10_000_000 + r["g"] % 10_000_000); T.append(r["t"])
        print(f"  {os.path.basename(p)}: {len(Y) - n0} 局面", flush=True)
    X, Y, G, T = np.array(X, np.float32), np.array(Y, np.float32), np.array(G), np.array(T)
    if cache:
        np.savez(cache, X=X, Y=Y, G=G, T=T)
    return X, Y, G, T


def auc(p, y):
    order = np.argsort(p)
    y = y[order]
    pos = y.sum(); neg = len(y) - pos
    ranks = np.arange(1, len(y) + 1)
    return float((ranks[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--hidden", default="512,256,128")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-5)
    ap.add_argument("--dropout", type=float, default=0.1)
    ap.add_argument("--cache", default="")
    ap.add_argument("--holdout", default="")
    ap.add_argument("--out", default="_big/model.json")
    a = ap.parse_args()
    X, Y, G, T = load(a.paths, a.cache)
    games = np.unique(G)
    rng = np.random.default_rng(1)
    va_games = set(rng.choice(games, size=len(games) * 10 // 100, replace=False).tolist())
    va = np.isin(G, list(va_games))
    print(f"局面 {len(X)} (学習 {(~va).sum()} / 検証 {va.sum()})  対局 {len(games)}")
    torch.manual_seed(1)
    hidden = [int(h) for h in a.hidden.split(",") if h]
    layers, prev = [], NB
    for h in hidden:
        layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(a.dropout)]
        prev = h
    layers.append(nn.Linear(prev, 1))
    net = nn.Sequential(*layers)
    xt, yt = torch.tensor(X[~va]), torch.tensor(Y[~va])
    xv, yv = torch.tensor(X[va]), torch.tensor(Y[va])
    opt = torch.optim.Adam(net.parameters(), lr=a.lr, weight_decay=a.wd)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, a.epochs)
    lossf = nn.BCEWithLogitsLoss()
    best = None
    for ep in range(a.epochs):
        net.train()
        perm = torch.randperm(len(xt))
        for i in range(0, len(xt), 1024):
            b = perm[i:i + 1024]
            opt.zero_grad()
            lossf(net(xt[b]).squeeze(1), yt[b]).backward()
            opt.step()
        sched.step()
        net.eval()
        with torch.no_grad():
            zv = net(xv).squeeze(1)
            vl = float(lossf(zv, yv))
        print(f"  周 {ep + 1}: 検証の損失 {vl:.4f}  AUC {auc(zv.numpy(), Y[va]):.4f}", flush=True)
        if best is None or vl < best[0]:
            best = (vl, ep, {k: v.clone() for k, v in net.state_dict().items()})
    net.load_state_dict(best[2])
    net.eval()
    with torch.no_grad():
        pv = torch.sigmoid(net(xv).squeeze(1)).numpy()
    print(f"いちばん良かった周 {best[1] + 1}  検証の損失 {best[0]:.4f}  AUC {auc(pv, Y[va]):.4f}")
    if a.holdout:
        H = [json.loads(l) for l in open(a.holdout, encoding="utf-8") if l.strip()]
        hx = torch.tensor(np.array([r["x"][:NB] for r in H], np.float32)); hy = np.array([r["y"] for r in H], np.float32)
        with torch.no_grad():
            print(f"第1世代の検証用 (holdout) の AUC: {auc(net(hx).squeeze(1).numpy(), hy):.4f}")
    lin = [m for m in net if isinstance(m, nn.Linear)]
    out = {"sizes": [NB] + [l.out_features for l in lin],
           "layers": [{"w": l.weight.detach().numpy().round(5).tolist(), "b": l.bias.detach().numpy().round(5).tolist()} for l in lin]}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("書き出し: " + a.out)


if __name__ == "__main__":
    main()
