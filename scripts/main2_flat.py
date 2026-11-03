"""Main 2 flat-shard art (2026-11-03): match the real COMPILED faces and command cards.

Real Main 2 command cards / COMPILED faces are flat vector paintings built from small
polygonal color shards (no block glitch). Each command card has its own picture.

    python main2_flat.py [count] [protos...]     # default count 2, all protocols but COURAGE
Output: E:\\SD\\SwarmUI\\Output\\main2_art\\flat\\<proto>\\<proto>_<slot>_s<seed>.png
slot: face (1344x960) or c0..c5 (896x1216, card values 0..5)
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm import generate, new_session  # noqa: E402

OUT = r"E:\SD\SwarmUI\Output\main2_art\flat"
MODEL = "anima_turboV11.safetensors"
OPTS = dict(steps=12, cfgscale=1, sampler="euler", scheduler="simple")
STYLE = ("masterpiece, best quality, score_7, newest, safe, flat vector illustration made of many "
         "small sharp polygonal color shards, torn paper facets, flat colors, crisp edges, "
         "graphic poster art, limited palette, ")
NEG = ("text, letters, words, watermark, signature, logo, frame, border, card frame, ui, "
       "photo, photorealistic, 3d render, gradient mesh, blurry, lowres, jpeg artifacts, "
       "pixel blocks, glitch, scanlines, anime girl, cute")

P = {
 "CHAOS": ("deep indigo and violet background, magenta and cyan accents, ",
   ["a swirling vortex of magenta and cyan energy with a pale ghostly face in its center",
    "a pale face dissolving into swirling purple shards",
    "a spiral of magenta energy ribbons in a dark violet void",
    "a cracked purple crystal orb with cyan light leaking out",
    "a twisted dark tree under a swirling violet sky",
    "a storm of purple and blue fragments spinning around a white core",
    "a whirlpool of blue and pink shards seen from above"]),
 "CLARITY": ("white and pale pink background, mint and sky blue shards, magenta accents, ",
   ["a huge rainbow iris eye of concentric yellow orange blue and green rings",
    "a clear crystal prism splitting white light into a rainbow",
    "concentric rainbow rings like a lens, floating glass shards",
    "a magenta diamond crystal with light rays",
    "an open eye made of pastel glass shards",
    "a white bird made of glass shards flying through light beams",
    "shattered mirror-like pastel glass with a rainbow disc"]),
 "CORRUPTION": ("bright lime green and dark forest green, black shadows, small red accents, ",
   ["a rotting green monster head with one glowing green eye and a red rune mark on its cheek",
    "a hunched green ghoul with glowing eyes in a dark swamp",
    "green toxic slime dripping over cracked stone",
    "a decaying tree with glowing green pustules",
    "a skull overgrown with green moss and fungus",
    "a clawed green hand reaching out of dark mud",
    "glowing green spores floating in a dark forest"]),
 "FEAR": ("burnt orange, rust and dark brown, black shadows, pale cream highlights, ",
   ["a tall shadowy monster silhouette with burning white eyes looming over a tiny running figure",
    "a dark figure running away down an orange corridor",
    "a giant clawed shadow on an orange wall",
    "a screaming pale mask in darkness",
    "glowing eyes peering out of black thorny bushes",
    "a lone lantern in an orange fog with a shadow behind",
    "a cracked doorway with a dark hand gripping its edge"]),
 "ICE": ("violet and purple background, pink accents, white ice crystals, ",
   ["a dark black moon sphere surrounded by white jagged ice spikes",
    "a black sphere in front of purple ice shards",
    "jagged white icicles hanging in a violet cave",
    "a frozen purple lake with white cracks",
    "falling white snow shards over a dark purple sky",
    "a tall ice crystal tower in purple light",
    "white triangle ice flakes swirling around a dark circle"]),
 "LUCK": ("bright orange, white and sky blue, red streaks, ",
   ["a spinning white and sky blue whirlpool like a cosmic coin with orange flames around it",
    "a giant spinning coin made of shards with flame streaks",
    "a blue and white spiral galaxy over orange fire",
    "dice made of shards tumbling through orange light",
    "a four leaf clover made of white and blue shards on orange",
    "a roulette wheel blur of orange and blue",
    "a shooting star of white shards across an orange sky"]),
 "MIRROR": ("magenta, crimson and purple, a strip of pale blue, ",
   ["a tall dark hooded figure with a glowing pink ring halo, split by a vertical mirror showing a blue reflection",
    "a cracked tall mirror reflecting a different pink world",
    "a dark silhouette facing its glowing magenta reflection",
    "a pink ring portal floating in a purple void",
    "two symmetrical dark figures mirrored in red light",
    "a broken mirror with magenta shards flying",
    "a pale blue reflection in a crimson pool"]),
 "PEACE": ("golden yellow and soft green with teal, warm light, ",
   ["a big calm tree on a quiet hill under golden sunlight",
    "tree branches with leaves against a golden sky",
    "a white dove flying over teal hills",
    "a calm teal lake reflecting a yellow sky",
    "a field of yellow flowers in soft light",
    "a small hut under a big leafy tree",
    "a sunrise behind soft green hills"]),
 "SMOKE": ("teal and pale mint, deep navy, tiny pink shard accents, ",
   ["thick billowing smoke clouds rising from a dark city",
    "swirling pale mint smoke over navy shards",
    "a dim figure hidden in teal smoke",
    "smoke pouring from a dark chimney into a teal sky",
    "a lantern glowing through thick mint fog",
    "drifting smoke ribbons over dark navy water",
    "a smoke screen covering a dark street"]),
 "TIME": ("crimson, orange and violet, bright yellow light streaks, ",
   ["glowing concentric clock rings of red and orange light spiraling into the distance",
    "curved light streaks circling a bright core",
    "a cracked clock face of shards",
    "an hourglass made of red and orange shards",
    "a tunnel of glowing orange rings",
    "bright yellow arcs sweeping over a crimson background",
    "gears of red and violet shards turning"]),
 "WAR": ("crimson red, black and dark maroon, orange embers, ",
   ["a burning battlefield forest with red flames and falling embers",
    "red burning trees with black silhouettes of soldiers",
    "a huge black beast silhouette over a burning field with swords stuck in the ground",
    "a dark armored warrior in red flames",
    "swords and spears stuck in burning ground",
    "a black war banner in a red sky full of embers",
    "two clashing black silhouettes in red fire"]),
}


def run(count, protos):
    sess = new_session()
    for proto in protos:
        bg, subs = P[proto]
        d = os.path.join(OUT, proto.lower())
        os.makedirs(d, exist_ok=True)
        base = 600000 + list(P).index(proto) * 1000
        slots = [("face", subs[0], 1344, 960)] + [
            (f"c{v}", subs[v + 1], 896, 1216) for v in range(6)]
        for si, (slot, sub, w, h) in enumerate(slots):
            for i in range(count):
                seed = base + si * 10 + i
                dst = os.path.join(d, f"{proto.lower()}_{slot}_s{seed}.png")
                if os.path.exists(dst):
                    continue
                path, secs, err = generate(sess, model=MODEL, seed=seed,
                                           prompt=STYLE + sub + ", " + bg + "abstract shard background",
                                           negativeprompt=NEG, width=w, height=h, **OPTS)
                if err:
                    print(proto, slot, seed, "FAILED", err, flush=True)
                    continue
                shutil.copy(path, dst)
                print(proto, slot, seed, f"{secs}s", flush=True)


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    ps = [p.upper() for p in sys.argv[2:]] or list(P)
    run(n, ps)
