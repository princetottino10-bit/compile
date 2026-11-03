/* =========================================================================
 * 公式ソロモード (BOT) のシナリオ — COMP-MN03 Rulesheet Solo Mode の表のとおり
 *   plays: BOT が1手番に出す札の並び ('up' 表向き・プロトコルの合うライン / 'low' 'high' 裏向き・BOT の合計がいちばん低い / 高いライン)
 *   control: BOT がコントロールを失うときの効果 ('none' / 'draw' 自分のデッキから1枚 / 'steal' あなたのデッキから1枚 / 'rearrange' あなたが並べ替え)
 *   通常モードは BOT のカードにコマンドが無いものとして扱う。上級モードはふつうに解決する
 *   level は戦績に残す番号 (BOT_BASE から。aidecks.js の fixedDeck・levelLabel が読む)
 * ========================================================================= */
export const BOT_BASE = 40;

export const BOT_SCENARIOS = [
  { mode: 'regular', lvl: 1, name: 'Define Parameters', protos: ['ENVY', 'GLUTTONY', 'GREED'], plays: ['up'], control: 'none' },
  { mode: 'regular', lvl: 2, name: 'Data Transfer', protos: ['MOMENTUM', 'OVERWHELM', 'PRIDE'], plays: ['up'], control: 'draw' },
  { mode: 'regular', lvl: 3, name: 'Merge Sort', protos: ['AMBUSH', 'FULCRUM', 'OVERWHELM'], plays: ['low', 'up'], control: 'steal' },
  { mode: 'regular', lvl: 4, name: 'Authentication', protos: ['AMBUSH', 'FULCRUM', 'OVERWHELM'], plays: ['up', 'up'], control: 'draw' },
  { mode: 'regular', lvl: 5, name: 'Distributed Denial of Service', protos: ['AMBUSH', 'FULCRUM', 'OVERWHELM'], plays: ['high', 'low', 'low'], control: 'draw' },
  { mode: 'regular', lvl: 6, name: '2-Factor Authentication', protos: ['MOMENTUM', 'OVERWHELM', 'PRIDE'], plays: ['up', 'up'], control: 'draw' },
  { mode: 'advanced', lvl: 1, name: 'Handshake', protos: ['FULCRUM', 'MOMENTUM', 'OVERWHELM'], plays: ['up'], control: 'none' },
  { mode: 'advanced', lvl: 2, name: 'Encryption', protos: ['FULCRUM', 'MOMENTUM', 'OVERWHELM'], plays: ['low', 'up'], control: 'draw' },
  { mode: 'advanced', lvl: 3, name: 'Vulnerability Exploit', protos: ['GLUTTONY', 'LUST', 'PRIDE'], plays: ['up', 'up'], control: 'steal' },
  { mode: 'advanced', lvl: 4, name: 'Benchmark', protos: ['AMBUSH', 'FULCRUM', 'MOMENTUM'], plays: ['up', 'up'], control: 'draw' },
  { mode: 'advanced', lvl: 5, name: 'Bottleneck', protos: ['AMBUSH', 'MOMENTUM', 'OVERWHELM'], plays: ['low', 'up', 'up'], control: 'rearrange' },
  { mode: 'advanced', lvl: 6, name: 'Root Access', protos: ['AMBUSH', 'MOMENTUM', 'OVERWHELM'], plays: ['up', 'up', 'up'], control: 'draw' }
].map((s, i) => Object.freeze({ ...s, level: BOT_BASE + i }));

export const isBotLevel = (level) => level >= BOT_BASE && level < BOT_BASE + BOT_SCENARIOS.length;
export const botScenarioOf = (level) => (isBotLevel(level) ? BOT_SCENARIOS[level - BOT_BASE] : null);

/* Engine.newGame の bot */
export const botOpts = (sc) => ({ side: 1, advanced: sc.mode === 'advanced', plays: sc.plays.slice(), control: sc.control });

export const BOT_PLAY_LABEL = { up: '表向き', low: '裏向き・いちばん低いライン', high: '裏向き・いちばん高いライン' };
export const BOT_CONTROL_LABEL = { none: '効果なし', draw: 'ドロー (BOT のデッキから1枚)', steal: 'スティール (あなたのデッキから1枚)', rearrange: '並べ替え (あなたが決める)' };
export const botModeLabel = (sc) => (sc.mode === 'advanced' ? 'ADVANCED' : 'REGULAR');
export const botLabel = (sc) => 'BOT ' + botModeLabel(sc) + ' Lv' + sc.lvl + ' ' + sc.name;
