#!/usr/bin/env python3
"""Pull a Main 2 illustration's colours toward the physical card.

SwarmUI tends to paint blue skies, so several shattered scenes ended up far
from the printed card's palette (COURAGE and LUCK blue instead of orange,
SMOKE blue instead of green, ...).  This keeps the scene and moves only the
colour: the a*/b* channels in CIELAB are shifted and scaled to the card's
statistics (Reinhard-style transfer), lightness is left alone.

TARGET holds the a*/b* mean and spread measured from the photo of the real
cards (`Compile 2/Compile_ Main 2/Photo/`), title text masked out.  Only the
protocols that measured off-colour are listed; the rest pass through.

usage: main2_grade.py <PROTO> <in.png> <out.png> [strength]
"""
import sys

import numpy as np
from PIL import Image

# proto: (a_mean, a_std, b_mean, b_std)  measured from the card photo
TARGET = {
    'CORRUPTION': (-14.7, 15.5, 19.9, 17.4),
    'ICE': (8.2, 8.0, -5.2, 16.3),
    'PEACE': (-11.9, 7.0, 30.3, 14.4),
    'SMOKE': (-9.2, 8.8, 13.4, 9.7),
    'CLARITY': (3.2, 13.4, 10.4, 13.8),
    'CHAOS': (13.0, 8.3, -7.8, 12.4),
    'MIRROR': (14.5, 12.6, -1.1, 15.8),
    'COURAGE': (23.0, 14.1, 28.8, 9.3),
    'LUCK': (7.1, 12.4, 37.3, 12.7),
}

STRENGTH = 1.0
# The photo is shot under room light on felt, so the print reads paler than it
# is.  Push the measured cast a bit further and never squeeze the painting's own
# colour spread by more than SPREAD_MIN, or the scene goes grey.
CAST_GAIN = 1.5
SPREAD_MIN = 0.8


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def rgb_to_lab(rgb):
    xyz = _lin(rgb / 255.0) @ _M.T / _WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def lab_to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * _WHITE
    rgb = _gam(xyz @ np.linalg.inv(_M).T)
    return np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)


def ab_stats(lab, mask=None):
    a, b = lab[..., 1], lab[..., 2]
    if mask is not None:
        a, b = a[mask], b[mask]
    return float(a.mean()), float(a.std()), float(b.mean()), float(b.std())


def grade(im, target, strength=STRENGTH):
    lab = rgb_to_lab(np.asarray(im.convert('RGB'), dtype=np.float64))
    am, asd, bm, bsd = ab_stats(lab)
    ta, tasd, tb, tbsd = target
    ta, tb = ta * CAST_GAIN, tb * CAST_GAIN
    ka = min(1.0, max(SPREAD_MIN, tasd / max(asd, 1e-6)))
    kb = min(1.0, max(SPREAD_MIN, tbsd / max(bsd, 1e-6)))
    out = lab.copy()
    out[..., 1] = (lab[..., 1] - am) * ka + ta
    out[..., 2] = (lab[..., 2] - bm) * kb + tb
    out[..., 1:] = lab[..., 1:] + (out[..., 1:] - lab[..., 1:]) * strength
    return Image.fromarray(lab_to_rgb(out))


def main():
    proto, src, dst = sys.argv[1].upper(), sys.argv[2], sys.argv[3]
    strength = float(sys.argv[4]) if len(sys.argv) > 4 else STRENGTH
    im = Image.open(src)
    if proto in TARGET:
        im = grade(im, TARGET[proto], strength)
    im.save(dst)


if __name__ == '__main__':
    main()
