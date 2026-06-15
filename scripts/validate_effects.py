# -*- coding: utf-8 -*-
"""effects.json と cards.json の整合検証。

検証内容:
1. cards.json の全カードに対し、テキストのあるスロットが effects.json に存在する(逆も)
2. effects.json の _text が cards.json の原文と完全一致する
3. DSL語彙(op / static.kind / trigger.on / select のキーと値)が仕様内である
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

OPS = {
    "draw", "discard", "flip", "delete", "return", "shift", "play", "reveal",
    "giveCard", "takeRandom", "rearrange", "swapProtocols", "refresh",
    "ifDone", "ifState", "choice", "forEachLine", "repeatPer",
    "drawByValue", "drawByCount", "noCompileNextTurn",
}
STATIC_KINDS = {
    "setValue", "modifyLineTotal", "playPermission", "ignoreMiddle", "skipCheckCache",
}
TRIGGER_EVENTS = {
    "start", "end", "afterOppDiscard", "afterYouClearCache", "afterYouDraw",
    "afterYouDelete", "wouldBeCovered", "wouldBeCoveredOrFlipped",
    "wouldBeDeletedByCompile",
}
SELECT_KEYS = {
    "owner", "facing", "coverage", "zone", "value", "exclude", "count",
    "mode", "ref",
}
SELECT_VALUES = {
    "owner": {"self", "opp", "any"},
    "facing": {"up", "down", "any"},
    "coverage": {"uncovered", "covered", "all", "any"},
    "zone": {"thisLine", "thisStack", "otherLine", "chosenLine",
             "otherLineWith8plus", "currentLine", "anywhere"},
    "exclude": {"thisCard"},
    "mode": {"all", "each", "pick"},
}
PLAY_DESTS = {
    "otherLine", "thisLine", "anyLine", "underThisCard", "currentLine",
}
SHIFT_DESTS = {"anyOther", "thisLine", "fromOrToThisLine", "oneOtherLine"}
PERMISSION_RULES = {
    "oppNoFaceDownThisLine", "oppNoPlayThisLine", "oppFaceDownOnly",
    "youFaceUpAnyLine",
}
REVEAL_TARGETS = {"oppHand", "ownHandCard"}

errors = []


def err(msg):
    errors.append(msg)


def check_select(cid, sel):
    if "ref" in sel:
        extra = set(sel) - {"ref"}
        if extra:
            err(f"{cid}: ref セレクタに余分なキー {extra}")
        return
    for k, v in sel.items():
        if k not in SELECT_KEYS:
            err(f"{cid}: 未知の select キー '{k}'")
        elif k in SELECT_VALUES and isinstance(v, str) and v not in SELECT_VALUES[k]:
            err(f"{cid}: select.{k} の未知の値 '{v}'")
    if "value" in sel:
        v = sel["value"]
        ok = (isinstance(v, dict) and set(v) <= {"in", "eq"}) or v in ("highest", "lowest")
        if not ok:
            err(f"{cid}: select.value が不正 {v!r}")


def check_ops(cid, ops):
    if not isinstance(ops, list) or not ops:
        err(f"{cid}: ops は空でないリストであること")
        return
    for o in ops:
        name = o.get("op")
        if name not in OPS:
            err(f"{cid}: 未知の op '{name}'")
            continue
        if "select" in o:
            check_select(cid, o["select"])
        if name in ("ifDone", "ifState", "forEachLine", "repeatPer"):
            check_ops(cid, o.get("ops", []))
        if name == "choice":
            for branch in o.get("options", []):
                check_ops(cid, branch)
        if name == "play" and "dest" in o and o["dest"] not in PLAY_DESTS:
            err(f"{cid}: play.dest の未知の値 '{o['dest']}'")
        if name == "shift" and "dest" in o and o["dest"] not in SHIFT_DESTS:
            err(f"{cid}: shift.dest の未知の値 '{o['dest']}'")
        if name == "reveal" and "target" in o and o["target"] not in REVEAL_TARGETS:
            err(f"{cid}: reveal.target の未知の値 '{o['target']}'")


def check_slot(cid, slot_name, slot, card_text):
    text = slot.get("_text", "")
    if text != card_text:
        err(f"{cid}.{slot_name}: _text が cards.json と不一致\n  cards : {card_text!r}\n  effects: {text!r}")
    bodies = [k for k in ("ops", "static", "trigger") if k in slot]
    if len(bodies) != 1:
        err(f"{cid}.{slot_name}: ops/static/trigger のいずれか1つを持つこと (現在 {bodies})")
        return
    kind = bodies[0]
    if kind == "ops":
        check_ops(cid + "." + slot_name, slot["ops"])
    elif kind == "static":
        st = slot["static"]
        if st.get("kind") not in STATIC_KINDS:
            err(f"{cid}.{slot_name}: 未知の static.kind '{st.get('kind')}'")
        if st.get("kind") == "playPermission" and st.get("rule") not in PERMISSION_RULES:
            err(f"{cid}.{slot_name}: 未知の permission rule '{st.get('rule')}'")
    elif kind == "trigger":
        tr = slot["trigger"]
        if tr.get("on") not in TRIGGER_EVENTS:
            err(f"{cid}.{slot_name}: 未知の trigger.on '{tr.get('on')}'")
        check_ops(cid + "." + slot_name, tr.get("ops", []))


def main():
    cards = json.loads((ROOT / "data" / "cards.json").read_text(encoding="utf-8"))
    effects = json.loads((ROOT / "data" / "effects.json").read_text(encoding="utf-8"))
    effects.pop("_meta", None)

    card_ids = set()
    slot_count = 0
    for proto in cards["protocols"]:
        for c in proto["cards"]:
            cid = c["id"]
            card_ids.add(cid)
            entry = effects.get(cid)
            has_text = {k: c.get(k, "") for k in ("upper", "middle", "lower")}
            if all(not t for t in has_text.values()):
                if entry:
                    err(f"{cid}: cards.json は効果なしだが effects.json に定義がある")
                continue
            if entry is None:
                err(f"{cid}: effects.json に定義がない")
                continue
            for slot_name, text in has_text.items():
                if text and slot_name not in entry:
                    err(f"{cid}: '{slot_name}' のテキストがあるが effects.json に定義がない")
                elif not text and slot_name in entry:
                    err(f"{cid}: '{slot_name}' は cards.json では空だが effects.json に定義がある")
                elif text:
                    slot_count += 1
                    check_slot(cid, slot_name, entry[slot_name], text)

    for cid in effects:
        if cid not in card_ids:
            err(f"{cid}: cards.json に存在しない id")

    print(f"カード: {len(card_ids)} / 検証スロット: {slot_count}")
    if errors:
        print(f"\nNG: {len(errors)} 件")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("OK: すべて整合")


if __name__ == "__main__":
    main()
