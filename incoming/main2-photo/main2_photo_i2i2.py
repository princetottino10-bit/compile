"""Main 2 photo rebuild, pass 2 (2026-11-08).

prep2/<name>.png      photo of the real card, perspective-corrected; header, text panels and
                      fingers replaced by a soft colour field
prep2/<name>_mask.png white = repaint (header, text panels, fingers), black = keep the photo

Step A: masked img2img, creativity 0.9 inside the mask -> invent art only where text/fingers were.
Step B: whole-image img2img at low creativity -> one consistent flat-shard finish, frame lines gone.

    python main2_photo_i2i2.py <prep2_dir> [B creativity ...]
Output: E:\\SD\\SwarmUI\\Output\\main2_art\\photo2\\<name>_b<creat>_s<seed>.png
"""
import base64
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm import generate, new_session  # noqa: E402
from main2_photo_i2i import MODEL, OPTS, STYLE, NEG, SUBJ  # noqa: E402

OUT = r"E:\SD\SwarmUI\Output\main2_art\photo2"


def b64(p):
    with open(p, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode()


def run(prep, levels):
    sess = new_session()
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(os.listdir(prep)):
        if not f.endswith(".png") or f.endswith("_mask.png"):
            continue
        name = f[:-4]
        sub = SUBJ.get(name.split("_")[0], "")
        for seed in (710000, 710001):
            a_dst = os.path.join(OUT, f"{name}_a_s{seed}.png")
            if not os.path.exists(a_dst):
                path, secs, err = generate(sess, model=MODEL, seed=seed, prompt=STYLE + sub,
                                           negativeprompt=NEG, width=896, height=1216,
                                           initimage=b64(os.path.join(prep, f)),
                                           maskimage=b64(os.path.join(prep, name + "_mask.png")),
                                           initimagecreativity=0.9, **OPTS)
                if err:
                    print(name, "A", seed, "FAILED", err, flush=True)
                    continue
                shutil.copy(path, a_dst)
                print(name, "A", seed, f"{secs}s", flush=True)
            for c in levels:
                dst = os.path.join(OUT, f"{name}_b{int(c*100)}_s{seed}.png")
                if os.path.exists(dst):
                    continue
                path, secs, err = generate(sess, model=MODEL, seed=seed, prompt=STYLE + sub,
                                           negativeprompt=NEG, width=896, height=1216,
                                           initimage=b64(a_dst), initimagecreativity=c, **OPTS)
                if err:
                    print(name, "B", c, seed, "FAILED", err, flush=True)
                    continue
                shutil.copy(path, dst)
                print(name, "B", c, seed, f"{secs}s", flush=True)


if __name__ == "__main__":
    run(sys.argv[1], [float(x) for x in sys.argv[2:]] or [0.3, 0.45])
