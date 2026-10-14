"""コンボ学習の確かめ (その2): 勝ち負けではなく「次の自分の手番までに点数 (aiScore) がどれだけ動くか」を当てる。
組み合わせで仕込んだ得が次の手番に出るなら、2枚の組の項で当てやすくなるはず。
5分割 (対局ごと) の交差検証で、点数だけ (M0) / + 1枚ずつ (M1) / + よく一緒に出る2枚の組 (M2) の決定係数 R2 を比べる。

    python3 scripts/combo_td_check.py "_combo/data_*.jsonl"
scipy を使う。
"""
import json,glob,numpy as np,itertools,sys
rows=[json.loads(l) for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else '_combo/data_*.jsonl')) for l in open(p) if l.strip()]
rows=[r for r in rows if r['sn'] is not None]
G=np.array([r['g'] for r in rows]); games=np.unique(G)
s=np.array([r['s'] for r in rows],float); d=np.array([r['sn']-r['s'] for r in rows],float)
d=np.clip(d,-400,400); s=np.clip(s,-1500,1500)
vocab={};pc={}
for r in rows:
  ks=sorted(set(r['k']))
  for k in ks: vocab.setdefault(k,len(vocab))
  for a,b in itertools.combinations(ks,2): pc[(a,b)]=pc.get((a,b),0)+1
pairs=[p for p,n in pc.items() if n>=60]; pidx={p:i for i,p in enumerate(pairs)}
print(len(rows),'rows',len(vocab),'tokens',len(pairs),'pairs')
from scipy import sparse
def build(withpairs):
  data=[];ri=[];ci=[]
  for i,r in enumerate(rows):
    ks=sorted(set(r['k']))
    for k in ks: ri.append(i);ci.append(vocab[k]);data.append(1.)
    if withpairs:
      for a,b in itertools.combinations(ks,2):
        j=pidx.get((a,b))
        if j is not None: ri.append(i);ci.append(len(vocab)+j);data.append(1.)
  return sparse.csr_matrix((data,(ri,ci)),shape=(len(rows),len(vocab)+len(pairs)))
from scipy.sparse.linalg import lsqr
base=np.c_[np.ones(len(rows)),s/100,(s/100)**2]
rng=np.random.default_rng(0);fold={g:i%5 for i,g in enumerate(rng.permutation(games))};F=np.array([fold[g] for g in G])
for name,X in (('M0',None),('M1',build(False)),('M2',build(True))):
  for lam in ([0] if X is None else [3,10,30]):
    sse=0;sst=0
    for f in range(5):
      tr,te=F!=f,F==f
      A=sparse.hstack([sparse.csr_matrix(base),X]).tocsr() if X is not None else sparse.csr_matrix(base)
      w=lsqr(A[tr],d[tr],damp=np.sqrt(lam) if lam else 0)[0]
      e=d[te]-A[te]@w; sse+=(e*e).sum(); sst+=((d[te]-d[tr].mean())**2).sum()
    print(name,lam,'R2 %.4f'%(1-sse/sst))
