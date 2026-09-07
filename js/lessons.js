// レッスン（段階ドリル）のお題生成。配列の行ごとに使える文字を増やしていく。
import { EN_WORDS } from './corpus/en-words.js';
import { JA_WORDS } from './corpus/ja-words.js';
import { canonicalRomaji } from './romaji.js';

export const STAGES = [
  { id: 'home', label: 'ホーム段のみ', rows: [1], newRow: 1 },
  { id: 'top', label: 'ホーム段 ＋ 上段', rows: [1, 0], newRow: 0 },
  { id: 'bottom', label: 'ホーム段 ＋ 下段', rows: [1, 2], newRow: 2 },
  { id: 'all', label: '全アルファベット', rows: [0, 1, 2], newRow: null },
];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function lettersOnly(chars) {
  return chars.filter((c) => /[a-z]/.test(c));
}

function fitsStage(romaji, allowed, mustUse) {
  const chars = [...romaji];
  if (!chars.every((c) => allowed.has(c))) return false;
  if (mustUse && !chars.some((c) => mustUse.has(c))) return false;
  return true;
}

/** 使える文字だけで擬似単語を作る（実単語が足りないときの補充）。 */
function pseudoWord(letters, len) {
  let w = '';
  for (let i = 0; i < len; i++) w += letters[Math.floor(Math.random() * letters.length)];
  return w;
}

/**
 * @param layout createLayout の戻り値
 * @param stage STAGES の要素
 * @param lang 'en' | 'ja'
 * @param count 語数
 * @returns 'en' なら string[]、'ja' なら {text, kana}[]
 */
export function lessonWords(layout, stage, lang, count) {
  const letters = lettersOnly(layout.charsInRows(stage.rows));
  const allowed = new Set(letters);
  const mustUse = stage.newRow === null || stage.rows.length === 1
    ? null
    : new Set(lettersOnly(layout.charsInRows([stage.newRow])));

  if (lang === 'ja') {
    const pool = JA_WORDS.filter((w) => fitsStage(canonicalRomaji(w.kana), allowed, mustUse));
    const picked = shuffle(pool).slice(0, count);
    while (picked.length < count) {
      const kana = pseudoWord(letters, 4 + Math.floor(Math.random() * 3));
      picked.push({ text: kana, kana });
    }
    return picked;
  }

  const pool = EN_WORDS.filter((w) => w.length >= 3 && fitsStage(w, allowed, mustUse));
  const picked = shuffle(pool).slice(0, count);
  while (picked.length < count) {
    picked.push(pseudoWord(letters, 3 + Math.floor(Math.random() * 4)));
  }
  return picked;
}
