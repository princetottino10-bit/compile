"""Main 2: rebuild card art from photos of the real cards (2026-11-08).

Input: prep/<proto>_<value>.png — a photo of the real card, perspective-corrected,
with frame lines, text and header boxes painted out (smudgy). img2img repaints the
smudges in the card's own flat-shard style while keeping its composition and colors.

    python main2_photo_i2i.py <prep_dir> [creativity ...]
Output: E:\\SD\\SwarmUI\\Output\\main2_art\\photo\\<name>_c<creativity>_s<seed>.png
"""
import base64
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm import generate, new_session  # noqa: E402

OUT = r"E:\SD\SwarmUI\Output\main2_art\photo"
MODEL = "anima_turboV11.safetensors"
OPTS = dict(steps=12, cfgscale=1, sampler="euler", scheduler="simple")
STYLE = ("masterpiece, best quality, score_7, newest, safe, flat color digital painting, "
         "posterized, many small sharp flat color shards, crisp edges, game card illustration, ")
NEG = ("text, letters, words, watermark, signature, logo, frame, border, ui, panel, box, "
       "hand, fingers, photo, blurry, lowres, jpeg artifacts, smudge")
SUBJ = {
    "war": "burning battlefield, huge black beast silhouette, red fire and embers, swords stuck in the ground",
    "luck": "swirling orange red and white shards around a sky blue and white vortex",
    "fear": "orange and rust shards, black shadowy claw shapes, dark menace",
    "mirror": "dark hooded figure with a magenta ring, pink and violet shards, pale blue reflection",
    "smoke": "teal and mint smoke shards, deep navy, tiny pink flakes",
    "clarity": "pastel white pink mint shards, rainbow lens disc",
    "courage": "red and orange triangular shards, white crescent shapes, blue sword hilt",
}


def run(prep, levels):
    sess = new_session()
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(os.listdir(prep)):
        if not f.endswith(".png"):
            continue
        name = f[:-4]
        with open(os.path.join(prep, f), "rb") as fh:
            init = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
        sub = SUBJ.get(name.split("_")[0], "")
        for c in levels:
            for seed in (700000, 700001):
                dst = os.path.join(OUT, f"{name}_c{int(c*100)}_s{seed}.png")
                if os.path.exists(dst):
                    continue
                path, secs, err = generate(sess, model=MODEL, seed=seed, prompt=STYLE + sub,
                                           negativeprompt=NEG, width=896, height=1216,
                                           initimage=init, initimagecreativity=c, **OPTS)
                if err:
                    print(name, c, seed, "FAILED", err, flush=True)
                    continue
                shutil.copy(path, dst)
                print(name, c, seed, f"{secs}s", flush=True)


if __name__ == "__main__":
    lv = [float(x) for x in sys.argv[2:]] or [0.35, 0.5]
    run(sys.argv[1], lv)
