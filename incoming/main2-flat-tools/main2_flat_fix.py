"""Redo single slots of main2_flat.py whose candidates were rejected (2026-11-03).

WAR c5: both candidates turned 'two clashing silhouettes' into a kissing couple.
    python main2_flat_fix.py
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm import generate, new_session  # noqa: E402
from main2_flat import MODEL, OPTS, STYLE, NEG, P, OUT  # noqa: E402

FIX = {
    ("WAR", "c5"): "two black armored knights fighting, swords crossed in a violent clash, battle, sparks, red fire behind them",
}
EXTRA_NEG = ", kiss, kissing, romance, couple, embrace, woman"


def main():
    sess = new_session()
    for (proto, slot), sub in FIX.items():
        bg = P[proto][0]
        d = os.path.join(OUT, proto.lower())
        for i in range(4):
            seed = 690000 + i
            dst = os.path.join(d, f"{proto.lower()}_{slot}_fix_s{seed}.png")
            if os.path.exists(dst):
                continue
            path, secs, err = generate(sess, model=MODEL, seed=seed,
                                       prompt=STYLE + sub + ", " + bg + "abstract shard background",
                                       negativeprompt=NEG + EXTRA_NEG, width=896, height=1216, **OPTS)
            if err:
                print(proto, slot, seed, "FAILED", err, flush=True)
                continue
            shutil.copy(path, dst)
            print(proto, slot, seed, f"{secs}s", flush=True)


if __name__ == "__main__":
    main()
