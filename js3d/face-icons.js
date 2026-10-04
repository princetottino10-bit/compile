/* =========================================================================
 * 顔のアイコン (CHIP で交換するプロフィールのアイコン)
 *   絵は art/icons/<キャラ>_<表情>.webp (scripts/avatar_icons.py が立ち絵から切り出す。立ち絵を描き直したら回し直す)。
 *   持っているかはガチャの帳簿 (gacha.js の owned 'icon:<key>') に入れる。アカウントの保存にも乗る。
 *   設定の icon には、プロトコルの名前 (FIRE など、レベルで解放) か、顔のアイコンの key (shion_happy など) が入る
 * ========================================================================= */
import { AVATARS } from './avatar.js';
import { emblemDataURL } from './emblems.js';
import { loadGacha, buyItem } from './gacha.js';

export const FACE_ICON_PRICE = 150;          // ガチャ10回分

const CHARS = ['shion', 'nadeshiko', 'asagi', 'yamabuki', 'zundamon', 'metan', 'tsumugi', 'whitecul'];
/* ゲスト (ずんだもんたち) の立ち絵は、てれ・しょんぼりの表情が無い */
const FACES = ['normal', 'happy', 'fired', 'surprised', 'shy', 'sad', 'frustrated'];
const GUEST_FACES = ['normal', 'happy', 'fired', 'surprised', 'frustrated'];
const FACE_NAMES = { normal: 'ふつう', happy: '笑顔', fired: 'やる気', surprised: 'おどろき', shy: 'てれ', sad: 'しょんぼり', frustrated: 'くやしい' };

export const FACE_ICONS = CHARS.filter(c => AVATARS[c])
  .flatMap(c => (AVATARS[c].guest ? GUEST_FACES : FACES).map(f => c + '_' + f));
export const isFaceIcon = (key) => FACE_ICONS.includes(key);
export const faceIconURL = (key) => 'art/icons/' + key + '.webp';

const split = (key) => { const i = key.lastIndexOf('_'); return [key.slice(0, i), key.slice(i + 1)]; };
export function faceIconName(key) {
  const [c, f] = split(key);
  return ((AVATARS[c] && AVATARS[c].name) || c) + '・' + (FACE_NAMES[f] || f);
}
export const ownsFaceIcon = (key, st = loadGacha()) => !!st.owned['icon:' + key];
/** 交換する (CHIP が足りない・もう持っていれば false) */
export const buyFaceIcon = (key, earned) => isFaceIcon(key) && buyItem('icon', key, FACE_ICON_PRICE, earned);

/** アイコンの絵 { src, color } (顔のアイコン、またはプロトコルの記号)。無ければ null */
export function iconArt(key, protocols, size = 40) {
  if (!key) return null;
  if (isFaceIcon(key)) {
    const [c] = split(key);
    return { src: faceIconURL(key), color: (AVATARS[c] && AVATARS[c].color) || '#b9a4ff', face: true };
  }
  const p = (protocols || []).find(x => x.name === key);
  return p ? { src: emblemDataURL(p.name, p.color || '#b9a4ff', size, true), color: p.color || '#b9a4ff' } : null;
}
