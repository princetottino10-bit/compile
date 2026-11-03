#!/usr/bin/env python3
"""Main 3 の12プロトコル (72枚) と Aux 3 の3プロトコル (18枚) を data/cards.json と data/effects.json に書き込む。

文面の出典: 公式のカード画像 (EN-COMP-MN03-Command-Cards*.png、2026-11-03 にユーザーが共有)。
日本語は既存の Main 1/2 の書き方 (「開始：」「終了：」「反転させる」「移動させる」など) にそろえて訳した。
番号は既存と同じく、そのプロトコルの6枚を値の小さい順に 1〜6 と振る (値は欠けがある: LUST は 0,2,3,4,5,6)。

何度流しても同じ結果になる (既存の Main 3 の項目を置き換える)。
    python3 scripts/main3_cards.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

D1 = 'あなたは手札を1枚捨て札にする。'
DISCARD1 = [{'op': 'discard', 'count': 1}]


def card(value, upper='', middle='', lower='', types=(), eff=None):
    return {'value': value, 'upper': upper, 'middle': middle, 'lower': lower,
            'types': list(types), 'eff': eff or {}}


def five(value):
    return card(value, middle=D1, types=['five'], eff={'middle': DISCARD1})


def mid(*ops):
    return {'middle': list(ops)}


def trig(on, *ops, **kw):
    t = {'on': on, 'ops': list(ops)}
    t.update(kw)
    return {'trigger': t}


def draw(n, **kw):
    return dict({'op': 'draw', 'count': n}, **kw)


THIS = {'ref': 'this'}

PROTOCOLS = [
    # ------------------------------------------------------------------ AMBUSH
    ('AMBUSH', '#4F7A8C', '反転／ドロー／裏向き', [
        card(0, middle='カードを3枚引く。あなたの裏向きのカードを1枚反転させる。', types=['draw', 'flip'],
             eff=mid(draw(3), {'op': 'flip', 'select': {'owner': 'self', 'facing': 'down'}})),
        card(1, middle='値が0か1の、あなたの他のすべてのカードを反転させる。反転させた枚数と同じ枚数のカードを引く。',
             types=['flip', 'draw'],
             eff=mid({'op': 'flip', 'select': {'owner': 'self', 'exclude': 'thisCard', 'value': {'in': [0, 1]}, 'mode': 'all'},
                      'bind': 'n'},
                     {'op': 'drawByCount', 'ref': 'n'})),
        card(2, middle='値が最も小さい、あなたの覆われているカードを1枚移動させる。', types=['shift'],
             eff=mid({'op': 'shift', 'select': {'owner': 'self', 'coverage': 'covered', 'value': 'lowest'}})),
        card(3, middle='値が最も大きい、相手の表向きで覆われているカードを1枚反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'owner': 'opp', 'facing': 'up', 'coverage': 'covered', 'value': 'highest'}})),
        card(4, middle='あなたの覆われていない裏向きのカードがある場合、カードを1枚引く。', types=['draw'],
             eff=mid({'op': 'ifState', 'cond': 'youHaveUncoveredFaceDown', 'ops': [draw(1)]})),
        five(5),
    ]),
    # ------------------------------------------------------------------ ENVY
    ('ENVY', '#26A6C9', '追い上げ／反転', [
        card(0, upper='このラインのあなたの合計値は、このラインにある値が最も大きい相手のカードの値だけ増える。', types=['other'],
             eff={'upper': {'static': {'kind': 'modifyLineTotal', 'side': 'self', 'deltaPer': 'oppHighestInLine'}}}),
        card(1, middle='相手がコントロールを持っている場合、あなたはカードを1枚反転させることができる。',
             lower='開始：相手がコントロールを持っている場合、あなたはコントロールを得る。', types=['flip', 'other'],
             eff={'middle': [{'op': 'ifState', 'cond': 'oppHasControl', 'ops': [{'op': 'flip', 'optional': True}]}],
                  'lower': trig('start', {'op': 'ifState', 'cond': 'oppHasControl', 'ops': [{'op': 'gainControl'}]})}),
        card(2, middle='相手の手札の枚数と同じ枚数のカードを引く。', types=['draw'],
             eff=mid({'op': 'drawDynamic', 'count': 'oppHand'})),
        card(3, lower='相手がこのラインにカードをプレイしたあと：あなたのデッキの一番上のカードをこのラインに裏向きでプレイする。',
             types=['play'],
             eff={'lower': trig('afterOppPlayInThisLine', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'thisLine'})}),
        card(4, middle='相手のコンパイル済みのプロトコルがあなたより多い場合、カードを1枚反転させる。', types=['flip'],
             eff=mid({'op': 'ifState', 'cond': 'oppMoreCompiled', 'ops': [{'op': 'flip'}]})),
        five(5),
    ]),
    # ------------------------------------------------------------------ FULCRUM
    ('FULCRUM', '#5C8FA8', 'ドロー／入れ替え／手札の枚数', [
        card(0, upper='開始：あなたの手札がちょうど0枚の場合、相手は手札を2枚捨て札にする。',
             middle='あなたの手札がちょうど0枚の場合、相手は手札を1枚捨て札にする。', types=['discard'],
             eff={'upper': trig('start', {'op': 'ifState', 'cond': 'handEq', 'n': 0,
                                          'ops': [{'op': 'discard', 'count': 2, 'player': 'opp'}]}),
                  'middle': [{'op': 'ifState', 'cond': 'handEq', 'n': 0, 'ops': [{'op': 'discard', 'count': 1, 'player': 'opp'}]}]}),
        card(1, middle='他のすべての表向きのカードを反転させる。あなたの左のスタックと右のスタックを入れ替える。',
             types=['flip', 'other'],
             eff=mid({'op': 'flip', 'select': {'facing': 'up', 'exclude': 'thisCard', 'mode': 'all'}},
                     {'op': 'swapSides', 'what': 'stacks'})),
        card(2, middle='あなたの手札がちょうど2枚の場合、相手のカードを1枚削除する。', types=['delete'],
             eff=mid({'op': 'ifState', 'cond': 'handEq', 'n': 2, 'ops': [{'op': 'delete', 'select': {'owner': 'opp'}}]})),
        card(3, middle='カードを1枚引く。あなたの左のプロトコルと右のプロトコルの位置を入れ替える。', types=['draw', 'rearrange'],
             eff=mid(draw(1), {'op': 'swapSides', 'what': 'protocols'})),
        card(4, middle='あなたの手札がちょうど4枚の場合、カードを1枚引く。', types=['draw'],
             eff=mid({'op': 'ifState', 'cond': 'handEq', 'n': 4, 'ops': [draw(1)]})),
        five(5),
    ]),
    # ------------------------------------------------------------------ GLUTTONY
    ('GLUTTONY', '#C9B22B', 'ドロー／キャッシュ／削除', [
        card(0, upper='あなたがキャッシュをクリアしたあと：あなたのデッキの一番上のカードを裏向きでプレイする。',
             middle='他のカードを1枚戻す。カードを1枚引く。', types=['play', 'return', 'draw'],
             eff={'upper': trig('afterYouClearCache', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'anyLine'}),
                  'middle': [{'op': 'return', 'select': {'exclude': 'thisCard'}}, draw(1)]}),
        card(1, middle='カードを2枚引く。', lower='いずれかのプレイヤーがキャッシュをクリアしたあと：カードを1枚削除する。',
             types=['draw', 'delete'],
             eff={'middle': [draw(2)], 'lower': trig('afterAnyClearCache', {'op': 'delete'})}),
        card(2, middle='あなたの手札の枚数と同じ枚数のカードを引く。', types=['draw'],
             eff=mid({'op': 'drawDynamic', 'count': 'yourHand'})),
        card(3, upper='終了：このカードが表向きのカードに覆われている場合、そのカードを削除する。', middle='カードを2枚引く。',
             types=['delete', 'draw'],
             eff={'upper': trig('end', {'op': 'bindCoverer', 'facing': 'up', 'bind': 'cov'},
                                {'op': 'ifDone', 'ops': [{'op': 'delete', 'select': {'ref': 'cov'}}]}),
                  'middle': [draw(2)]}),
        card(4, lower='あなたがリフレッシュしたあと：カードを1枚引く。', types=['draw'],
             eff={'lower': trig('afterYouRefresh', draw(1))}),
        five(5),
    ]),
    # ------------------------------------------------------------------ GREED
    ('GREED', '#9C3FB5', '捨て札／繰り返す効果', [
        card(0, middle='あなたのすべての手札を捨て札にする。カードを1枚削除する。', lower='あなたがカードを削除したあと：カードを1枚引く。',
             types=['discard', 'delete', 'draw'],
             eff={'middle': [{'op': 'discard', 'count': 'all'}, {'op': 'delete'}],
                  'lower': trig('afterYouDelete', draw(1))}),
        card(1, lower='終了：あなたの合計値が10以上あり、相手より大きいラインを1つコンパイルする。', types=['other'],
             eff={'lower': trig('end', {'op': 'compileLine'})}),
        card(2, middle='相手は手札を1枚捨て札にする。', lower='開始：あなたは自分のカードを1枚戻すことができる。',
             types=['discard', 'return'],
             eff={'middle': [{'op': 'discard', 'count': 1, 'player': 'opp'}],
                  'lower': trig('start', {'op': 'return', 'select': {'owner': 'self'}, 'optional': True})}),
        card(3, middle='このスタックにある、あなたの覆われているカードを1枚移動させる。', types=['shift'],
             eff=mid({'op': 'shift', 'select': {'owner': 'self', 'coverage': 'covered', 'zone': 'thisStack'}})),
        card(4, middle='あなたはすべての手札を捨て札にすることができる。そうした場合、カードを1枚反転させる。', types=['discard', 'flip'],
             eff=mid({'op': 'discard', 'count': 'all', 'optional': True}, {'op': 'ifDone', 'ops': [{'op': 'flip'}]})),
        five(5),
    ]),
    # ------------------------------------------------------------------ LUST
    ('LUST', '#E0533C', '強制プレイ／コントロール', [
        card(0, upper='このラインの各プレイヤーの合計値は10増える。', middle='コントロールを得る。',
             lower='あなたがコントロールを持っている場合、相手はコンパイルすることができない。', types=['other'],
             eff={'upper': {'static': {'kind': 'modifyLineTotal', 'side': 'both', 'delta': 10}},
                  'middle': [{'op': 'gainControl'}],
                  'lower': {'static': {'kind': 'oppNoCompileIfControl'}}}),
        card(2, middle='あなたは相手の覆われているカードを1枚このラインへ移動させることができる。',
             lower='このスタックには、プロトコルを対応させずにあなたのカードをプレイすることができる。', types=['shift', 'play'],
             eff={'middle': [{'op': 'shift', 'select': {'owner': 'opp', 'coverage': 'covered'}, 'dest': 'thisLine', 'optional': True}],
                  'lower': {'static': {'kind': 'playPermission', 'rule': 'youAnyProtoThisStack'}}}),
        card(3, middle='相手は手札からランダムにカードを1枚公開する。そのカードを相手側に裏向きでプレイする。',
             lower='終了：あなたはコントロールを失うことができる。そうした場合、カードを1枚反転させる。', types=['play', 'flip'],
             eff={'middle': [{'op': 'oppRandomPlayDown'}],
                  'lower': trig('end', {'op': 'loseControl', 'optional': True}, {'op': 'ifDone', 'ops': [{'op': 'flip'}]})}),
        card(4, middle='あなたは手札をすべて公開する。相手はコントロールを失う。', lower='相手がコントロールを得たあと：カードを1枚引く。',
             types=['other', 'draw'],
             eff={'middle': [{'op': 'reveal', 'target': 'ownHand'}, {'op': 'loseControl', 'player': 'opp'}],
                  'lower': trig('afterOppGainControl', draw(1))}),
        five(5),
        card(6, middle='あなたは手札を1枚捨て札にする。相手はこのラインにカードを裏向きで1枚プレイする。', types=['discard', 'play'],
             eff=mid({'op': 'discard', 'count': 1}, {'op': 'play', 'player': 'opp', 'facing': 'down', 'dest': 'thisLine'})),
    ]),
    # ------------------------------------------------------------------ MOMENTUM
    ('MOMENTUM', '#E8892E', 'コンパイル後／ドロー', [
        card(0, middle='コンパイル済みのプロトコルがある各ラインに、あなたのデッキの一番上のカードを裏向きで1枚ずつプレイする。',
             types=['play'],
             eff=mid({'op': 'forEachLine', 'lines': 'linesWithCompiled',
                      'ops': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'currentLine'}]})),
        card(1, upper='いずれかのプレイヤーがコンパイルしたあと：あなたのデッキの一番上のカードをこのスタックに裏向きでプレイする。',
             lower='いずれかのプレイヤーがプロトコルを並べ替えたあと：あなたは手札を1枚捨て札にする。カードを1枚引く。',
             types=['play', 'discard', 'draw'],
             eff={'upper': trig('afterAnyCompile', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'thisStack'}),
                  'lower': trig('afterAnyRearrange', {'op': 'discard', 'count': 1}, draw(1))}),
        card(3, middle='カードを2枚引く。', types=['draw'], eff=mid(draw(2))),
        card(4, middle='あなたのプロトコルを並べ替える。', types=['rearrange'], eff=mid({'op': 'rearrange'})),
        five(5),
        card(6, upper='いずれかのプレイヤーがコンパイルしたあと：このカードを削除する。', middle=D1, types=['delete', 'discard'],
             eff={'upper': trig('afterAnyCompile', {'op': 'delete', 'select': THIS}), 'middle': DISCARD1}),
    ]),
    # ------------------------------------------------------------------ NOVA
    ('NOVA', '#F07A1A', 'スタックの枚数／移動／並べ替え', [
        card(0, upper='開始：あなたのカードがちょうど5枚あるラインを1つ選び、そのラインのすべての表向きのカードを削除する。',
             middle='コントロールを持っているプレイヤーは、あなたのプロトコルのうち2枚の位置を入れ替える。',
             lower='終了：覆われていないあなたの「NOVA」カードの下に、あなたのデッキの一番上のカードを裏向きでプレイする。',
             types=['delete', 'rearrange', 'play'],
             eff={'upper': trig('start', {'op': 'delete', 'select': {'zone': 'chosenLine', 'lineCond': 'youHave5',
                                                                     'facing': 'up', 'mode': 'all'}}),
                  'middle': [{'op': 'swapProtocols', 'chooser': 'controlHolder'}],
                  'lower': trig('end', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'underOwnProto'})}),
        card(1, middle='相手は、このスタックにあるカードの枚数と同じ枚数の手札を捨て札にする。', types=['discard'],
             eff=mid({'op': 'discard', 'count': 'thisStack', 'player': 'opp'})),
        card(2, middle='このカードが「NOVA」カードを覆っている場合、あなたは自分のプロトコルを並べ替えることができる。そうでない場合、コントロールを得る。',
             lower='あなたがプロトコルを並べ替えたあと：あなたは裏向きのカードを1枚移動させることができる。',
             types=['rearrange', 'shift'],
             eff={'middle': [{'op': 'ifState', 'cond': 'thisCoversOwnProto', 'ops': [{'op': 'rearrange', 'optional': True}],
                              'else': [{'op': 'gainControl'}]}],
                  'lower': trig('afterYouRearrange', {'op': 'shift', 'select': {'facing': 'down'}, 'optional': True})}),
        card(3, middle='このスタックにあるカードの枚数より値が小さいカードを1枚移動させる。', types=['shift'],
             eff=mid({'op': 'shift', 'select': {'value': {'ltThisStack': True}}})),
        card(4, middle='このスタックにあるカードの枚数より値が小さいカードを1枚反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'value': {'ltThisStack': True}}})),
        five(5),
    ]),
    # ------------------------------------------------------------------ OVERWHELM
    ('OVERWHELM', '#6B7FA0', '裏向きでプレイ／勝ち越し', [
        card(1, middle='あなたの合計値が相手より大きい各ラインに、あなたのデッキの一番上のカードを裏向きで1枚ずつプレイする。', types=['play'],
             eff=mid({'op': 'forEachLine', 'lines': 'linesYouLead',
                      'ops': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'currentLine'}]})),
        card(2, upper='終了：あなたのデッキの一番上のカードを、各ラインに裏向きで1枚ずつプレイする。このカードを反転させる。',
             middle='相手は自分のデッキの一番上のカードを、各ラインに裏向きで1枚ずつプレイする。', types=['play', 'flip'],
             eff={'upper': trig('end', {'op': 'forEachLine', 'lines': 'allLines',
                                        'ops': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'currentLine'}]},
                                {'op': 'flip', 'select': THIS}),
                  'middle': [{'op': 'forEachLine', 'lines': 'allLines',
                              'ops': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'currentLine', 'player': 'opp'}]}]}),
        card(3, lower='終了：あなたの手札が5枚以上ある場合、あなたのデッキの一番上のカードをこのスタックに裏向きでプレイする。', types=['play'],
             eff={'lower': trig('end', {'op': 'ifState', 'cond': 'handGe', 'n': 5,
                                        'ops': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'thisStack'}]})}),
        card(4, middle='場にあるあなたのカードが相手より多い場合、値が最も小さい相手の覆われているカードを1枚削除する。', types=['delete'],
             eff=mid({'op': 'ifState', 'cond': 'moreCardsInPlay',
                      'ops': [{'op': 'delete', 'select': {'owner': 'opp', 'coverage': 'covered', 'value': 'lowest'}}]})),
        five(5),
        card(6, upper='開始：このラインで相手の合計値があなたより大きい場合、このカードを反転させる。', types=['flip'],
             eff={'upper': trig('start', {'op': 'ifState', 'cond': 'oppLeadsThisLine', 'ops': [{'op': 'flip', 'select': THIS}]})}),
    ]),
    # ------------------------------------------------------------------ PRIDE
    ('PRIDE', '#D9A21E', '優位を保つ／移動／ドロー', [
        card(0, upper='あなたがコンパイルしたあと：リフレッシュする。',
             middle='あなたがコントロールを持っている場合、他のカードを1枚移動させる。そうでない場合、あなたのカードを1枚移動させる。',
             types=['draw', 'shift'],
             eff={'upper': trig('afterYouCompile', {'op': 'refresh'}),
                  'middle': [{'op': 'ifState', 'cond': 'youHaveControl',
                              'ops': [{'op': 'shift', 'select': {'exclude': 'thisCard'}}],
                              'else': [{'op': 'shift', 'select': {'owner': 'self'}}]}]}),
        card(2, middle='あなたの合計値が相手より大きいラインの数と同じ枚数のカードを引く。',
             lower='開始：このラインであなたの合計値が相手より大きい場合、カードを1枚引く。', types=['draw'],
             eff={'middle': [{'op': 'drawDynamic', 'count': 'linesYouLead'}],
                  'lower': trig('start', {'op': 'ifState', 'cond': 'youLeadThisLine', 'ops': [draw(1)]})}),
        card(3, middle='あなたの裏向きのカードを1枚反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'owner': 'self', 'facing': 'down'}})),
        card(4, middle='あなたがコントロールを持っている場合、あなたは相手のカードを1枚このラインへ移動させることができる。', types=['shift'],
             eff=mid({'op': 'ifState', 'cond': 'youHaveControl',
                      'ops': [{'op': 'shift', 'select': {'owner': 'opp'}, 'dest': 'thisLine', 'optional': True}]})),
        five(5),
        card(6, upper='相手がコントロールを得たあと：このカードを反転させる。', middle='相手がコントロールを持っている場合、このカードを反転させる。',
             types=['flip'],
             eff={'upper': trig('afterOppGainControl', {'op': 'flip', 'select': THIS}),
                  'middle': [{'op': 'ifState', 'cond': 'oppHasControl', 'ops': [{'op': 'flip', 'select': THIS}]}]}),
    ]),
    # ------------------------------------------------------------------ SLOTH
    ('SLOTH', '#8A8F98', '捨て札／反転', [
        card(0, upper='このカードが「SLOTH」カードに覆われている場合、このラインのあなたの合計値は5増える。',
             middle='あなたの合計値が相手より小さいラインの数と同じ枚数のカードを引く。', types=['other', 'draw'],
             eff={'upper': {'static': {'kind': 'modifyLineTotal', 'side': 'self', 'delta': 5, 'cond': 'coveredByOwnProto'}},
                  'middle': [{'op': 'drawDynamic', 'count': 'linesOppLeads'}]}),
        card(1, middle='他のカードを1枚戻す。戻したカードがあなたのカードの場合、リフレッシュする。',
             lower='あなたがリフレッシュしたあと：あなたのデッキの一番上のカードをこのスタックに裏向きでプレイする。',
             types=['return', 'draw', 'play'],
             eff={'middle': [{'op': 'return', 'select': {'exclude': 'thisCard'}, 'bind': 'r'},
                             {'op': 'ifState', 'cond': 'boundIsMine', 'ref': 'r', 'ops': [{'op': 'refresh'}]}],
                  'lower': trig('afterYouRefresh', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'thisStack'})}),
        card(2, middle='あなたの覆われているカードを1枚反転させる。', lower='開始：あなたは手札を1枚デッキの一番下に置くことができる。',
             types=['flip', 'other'],
             eff={'middle': [{'op': 'flip', 'select': {'owner': 'self', 'coverage': 'covered'}}],
                  'lower': trig('start', {'op': 'handToDeckBottom', 'optional': True})}),
        card(3, middle='相手は手札を2枚捨て札にする。', types=['discard'],
             eff=mid({'op': 'discard', 'count': 2, 'player': 'opp'})),
        card(4, lower='このカードが覆われることになったとき：先に表向きのカードを1枚反転させる。', types=['flip'],
             eff={'lower': trig('wouldBeCovered', {'op': 'flip', 'select': {'facing': 'up'}})}),
        five(5),
    ]),
    # ------------------------------------------------------------------ WRATH
    ('WRATH', '#C62A2A', '削除／裏向き', [
        card(0, upper='このラインにある値が最も大きいすべてのカードは、合計値に加えない。',
             middle='あなたのデッキの一番上のカードをこのスタックに裏向きでプレイする。', types=['other', 'play'],
             eff={'upper': {'static': {'kind': 'excludeHighestInLine'}},
                  'middle': [{'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'thisStack'}]}),
        card(1, middle='カードを1枚引く。', lower='終了：コントロールを失う。そうした場合、表向きのカードを1枚削除する。',
             types=['draw', 'delete'],
             eff={'middle': [draw(1)],
                  'lower': trig('end', {'op': 'loseControl'}, {'op': 'ifDone', 'ops': [{'op': 'delete', 'select': {'facing': 'up'}}]})}),
        card(2, middle='カードが最も多いラインを1つ選び、そのラインのすべての表向きのカードを反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'zone': 'chosenLine', 'lineCond': 'mostCards', 'facing': 'up', 'mode': 'all'}})),
        card(3, middle='表向きのカードを1枚反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'facing': 'up'}})),
        card(4, middle='コントロールを失う。そうした場合、相手は手札を2枚捨て札にする。', types=['discard'],
             eff=mid({'op': 'loseControl'}, {'op': 'ifDone', 'ops': [{'op': 'discard', 'count': 2, 'player': 'opp'}]})),
        five(5),
    ]),
]


# Aux 3。文面の出典はカード一覧の書き起こし (公式画像は未入手。2026-11-03)
AUX3 = [
    # ------------------------------------------------------------------ FLEXIBLE
    ('FLEXIBLE', '#D05FB8', '選択／移動／ドロー', [
        card(0, middle='カードを1枚戻すか、移動させる。', types=['return', 'shift'],
             eff=mid({'op': 'choice', 'options': [[{'op': 'return'}], [{'op': 'shift'}]]})),
        card(1, middle='あなたのカードを1枚反転させるか、移動させる。', types=['flip', 'shift'],
             eff=mid({'op': 'choice', 'options': [[{'op': 'flip', 'select': {'owner': 'self'}}],
                                                  [{'op': 'shift', 'select': {'owner': 'self'}}]]})),
        card(2, upper='終了：このカードが裏向きのカードに覆われている場合、あなたはそのカードを移動させることができる。',
             middle='カードを1枚引く。', types=['shift', 'draw'],
             eff={'upper': trig('end', {'op': 'bindCoverer', 'facing': 'down', 'bind': 'cov'},
                                {'op': 'ifDone', 'ops': [{'op': 'shift', 'select': {'ref': 'cov'}, 'optional': True}]}),
                  'middle': [draw(1)]}),
        card(3, middle='相手のカードを1枚移動させるか、あなたのプロトコルのうち2枚の位置を入れ替える。', types=['shift', 'rearrange'],
             eff=mid({'op': 'choice', 'options': [[{'op': 'shift', 'select': {'owner': 'opp'}}], [{'op': 'swapProtocols'}]]})),
        card(4, lower='終了：あなたはカードを2枚引くことができる。そうした場合、このカードを反転させる。', types=['draw', 'flip'],
             eff={'lower': trig('end', draw(2, optional=True), {'op': 'ifDone', 'ops': [{'op': 'flip', 'select': dict(THIS)}]})}),
        five(5),
    ]),
    # ------------------------------------------------------------------ INERT
    ('INERT', '#5E8C84', '表向きの打ち消し／おたがい', [
        card(0, upper='このラインの他のすべてのカードは、上段を持たない。',
             middle='他のラインにある、覆われているか覆われていない表向きのカードを1枚反転させる。', types=['other', 'flip'],
             eff={'upper': {'static': {'kind': 'noUpperInLine'}},
                  'middle': [{'op': 'flip', 'select': {'zone': 'otherLines', 'facing': 'up', 'coverage': 'any'}}]}),
        card(1, middle='相手は手札を2枚捨て札にする。', lower='このラインの他のすべてのカードは、下段を持たない。',
             types=['discard', 'other'],
             eff={'middle': [{'op': 'discard', 'count': 2, 'player': 'opp'}],
                  'lower': {'static': {'kind': 'noLowerInLine'}}}),
        card(2, middle='1ラインを選び、そのラインで値が最も大きい表向きのカードをすべて反転させる。', types=['flip'],
             eff=mid({'op': 'flip', 'select': {'zone': 'chosenLine', 'facing': 'up', 'value': 'highest', 'mode': 'all'}})),
        card(3, middle='他の各ラインにカードを裏向きで1枚ずつプレイする。相手はこのラインにカードを裏向きで1枚プレイする。', types=['play'],
             eff=mid({'op': 'forEachLine', 'lines': 'otherLines',
                      'ops': [{'op': 'play', 'source': 'hand', 'facing': 'down', 'dest': 'currentLine'}]},
                     {'op': 'play', 'player': 'opp', 'facing': 'down', 'dest': 'thisLine'})),
        card(4, middle='あなたのデッキのカードをすべて捨て札にする。相手は自分のデッキのカードをすべて捨て札にする。', types=['discard'],
             eff=mid({'op': 'discardDeck'}, {'op': 'discardDeck', 'player': 'opp'})),
        five(5),
    ]),
    # ------------------------------------------------------------------ RIGID
    ('RIGID', '#7A5FD0', '裏向きでプレイ／妨害', [
        card(1, middle='相手の表向きのカードを1枚反転させる。',
             lower='終了：相手の覆われていないカードが裏向きである他の各ラインに、カードを裏向きで1枚ずつプレイする。',
             types=['flip', 'play'],
             eff={'middle': [{'op': 'flip', 'select': {'owner': 'opp', 'facing': 'up'}}],
                  'lower': trig('end', {'op': 'forEachLine', 'lines': 'otherLinesOppTopDown',
                                        'ops': [{'op': 'play', 'source': 'hand', 'facing': 'down', 'dest': 'currentLine'}]})}),
        card(2, lower='あなたがアクションでカードを裏向きでプレイしたあと：あなたのデッキの一番上のカードを同じスタックに裏向きでプレイする。',
             types=['play'],
             eff={'lower': trig('afterYouPlayDownAction', {'op': 'play', 'source': 'topDeck', 'facing': 'down', 'dest': 'eventStack'})}),
        card(3, middle='このカードのすぐ下に、カードを裏向きで1枚プレイする。', types=['play'],
             eff=mid({'op': 'play', 'source': 'hand', 'facing': 'down', 'dest': 'underThisCard'})),
        card(4, lower='このカードが裏向きのカードに覆われることになったとき：先にカードを1枚引く。', types=['draw'],
             eff={'lower': trig('wouldBeCovered', draw(1), byFacing='down')}),
        five(5),
        card(7, upper='終了：相手は、カードを1枚引くか、カードを1枚プレイするかを選ぶ。', middle=D1,
             lower='このカードを反転させることはできず、移動させることもできない。', types=['other', 'five'],
             eff={'upper': trig('end', {'op': 'choice', 'chooser': 'opp', 'options': [
                      [draw(1, player='opp')], [{'op': 'play', 'player': 'opp'}]]}),
                  'middle': DISCARD1,
                  'lower': {'static': {'kind': 'cannotFlipOrShiftThis'}}}),
    ]),
]


def slot_eff(text, spec):
    """effects.json の1スロット。spec は ops の配列か、static/trigger を持つ dict"""
    out = {'_text': text}
    if isinstance(spec, list):
        out['ops'] = spec
    else:
        out.update(spec)
    return out


def main():
    cpath = os.path.join(ROOT, 'data', 'cards.json')
    epath = os.path.join(ROOT, 'data', 'effects.json')
    cards = json.load(open(cpath, encoding='utf-8'))
    effects = json.load(open(epath, encoding='utf-8'))
    names = {p[0] for p in PROTOCOLS}
    cards['protocols'] = [p for p in cards['protocols'] if p['name'] not in names]
    for k in list(effects):
        if k.split('_')[0] in names:
            del effects[k]
    names |= {p[0] for p in AUX3}
    cards['protocols'] = [p for p in cards['protocols'] if p['name'] not in names]
    for k in list(effects):
        if k.split('_')[0] in names:
            del effects[k]
    for (name, color, tags, cs), set_name in [(p, 'Main 3') for p in PROTOCOLS] + [(p, 'Aux 3') for p in AUX3]:
        assert len(cs) == 6, name
        out = []
        for n, c in enumerate(sorted(cs, key=lambda x: x['value']), start=1):
            cid = '{}_{}'.format(name, n)
            out.append({'id': cid, 'number': n, 'value': c['value'], 'upper': c['upper'], 'middle': c['middle'],
                        'lower': c['lower'], 'effectTypes': c['types']})
            e = {}
            for slot in ('upper', 'middle', 'lower'):
                if c[slot]:
                    assert slot in c['eff'], (cid, slot)
                    e[slot] = slot_eff(c[slot], c['eff'][slot])
            for slot in c['eff']:
                assert c[slot], (cid, slot, 'text missing')
            effects[cid] = e
        cards['protocols'].append({'name': name, 'displayName': name, 'tags': tags, 'color': color,
                                   'set': set_name, 'cards': out})
    with open(cpath, 'w', encoding='utf-8') as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
        f.write('\n')
    with open(epath, 'w', encoding='utf-8') as f:
        json.dump(effects, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('Main 3 + Aux 3: {} protocols, {} cards'.format(len(PROTOCOLS) + len(AUX3), 6 * (len(PROTOCOLS) + len(AUX3))))


if __name__ == '__main__':
    main()
