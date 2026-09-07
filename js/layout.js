// 配列定義と、物理キー(QWERTY)→配列文字の変換。純粋データ＋純粋関数のみ。

export const LAYOUT_NAME = 'Astarte 改';

// 練習対象の配列（Astarte改）。行ごとに10文字。
export const DEFAULT_LAYOUT_ROWS = ['qpuy,jdhgw', 'ioea.ktnsr', 'zxcv;mlfb/'];

// 同じ物理位置の QWERTY 文字（キー上の副ラベル用）
export const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];

// 同じ物理位置の KeyboardEvent.code
const CODE_ROWS = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

// 記号キーの Shift 面（QWERTY と同じ対応を採用）
export const SHIFTED_SYMBOL = { ',': '<', '.': '>', ';': ':', '/': '?' };
const BASE_OF_SHIFTED = Object.fromEntries(
  Object.entries(SHIFTED_SYMBOL).map(([base, shifted]) => [shifted, base]),
);

// 列 → 指（0: 左小指 … 9: 右小指）
export const FINGER_BY_COL = ['lp', 'lr', 'lm', 'li', 'li', 'ri', 'ri', 'rm', 'rr', 'rp'];
export const FINGER_LABEL = {
  lp: '左小指', lr: '左薬指', lm: '左中指', li: '左人差し指',
  ri: '右人差し指', rm: '右中指', rr: '右薬指', rp: '右小指',
};

const ALLOWED_CHARS = /^[a-z,.;/'\-\[\]]$/;

/**
 * 配列文字列（3行×10文字）を検証する。
 * @returns {string|null} エラーメッセージ。問題なければ null。
 */
export function validateLayoutRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) return '3行必要です';
  for (let r = 0; r < 3; r++) {
    if (typeof rows[r] !== 'string' || rows[r].length !== 10) {
      return `${r + 1}行目は10文字にしてください（現在 ${rows[r]?.length ?? 0} 文字）`;
    }
    for (const ch of rows[r]) {
      if (!ALLOWED_CHARS.test(ch)) return `使えない文字があります: "${ch}"`;
    }
  }
  const all = rows.join('');
  const seen = new Set();
  for (const ch of all) {
    if (seen.has(ch)) return `文字が重複しています: "${ch}"`;
    seen.add(ch);
  }
  return null;
}

/**
 * 配列オブジェクトを作る。
 * keyByCode / keyByChar のほか、イベント→文字、文字→キーの変換関数を持つ。
 */
export function createLayout(rows = DEFAULT_LAYOUT_ROWS) {
  const err = validateLayoutRows(rows);
  if (err) throw new Error(err);

  const keys = [];
  const keyByCode = new Map();
  const keyByChar = new Map();

  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const key = {
        code: CODE_ROWS[r][c],
        char: ch,
        shifted: SHIFTED_SYMBOL[ch] ?? ch.toUpperCase(),
        qwerty: QWERTY_ROWS[r][c],
        row: r,
        col: c,
        finger: FINGER_BY_COL[c],
      };
      keys.push(key);
      keyByCode.set(key.code, key);
      keyByChar.set(ch, key);
    });
  });

  /**
   * KeyboardEvent から入力文字を決める。
   * convert=false なら QWERTY のまま（OS側で配列を切り替えている人向け）。
   * @returns {{char: string, key: object|null}|null} 文字入力でなければ null。
   */
  function charFromEvent(ev, convert = true) {
    if (ev.code === 'Space') return { char: ' ', key: null };
    const key = keyByCode.get(ev.code) ?? null;
    if (!convert) {
      return ev.key && ev.key.length === 1 ? { char: ev.key, key } : null;
    }
    if (key) {
      return { char: ev.shiftKey ? key.shifted : key.char, key };
    }
    // 配列に無いキー（数字など）は QWERTY のまま通す
    return ev.key && ev.key.length === 1 ? { char: ev.key, key: null } : null;
  }

  /**
   * 目標文字を打つのに必要なキー情報。
   * @returns {{key: object|null, shift: boolean, space: boolean}}
   */
  function keyForChar(ch) {
    if (ch === ' ') return { key: null, shift: false, space: true };
    const lower = ch.toLowerCase();
    if (keyByChar.has(lower)) {
      return { key: keyByChar.get(lower), shift: ch !== lower, space: false };
    }
    if (BASE_OF_SHIFTED[ch] && keyByChar.has(BASE_OF_SHIFTED[ch])) {
      return { key: keyByChar.get(BASE_OF_SHIFTED[ch]), shift: true, space: false };
    }
    return { key: null, shift: false, space: false };
  }

  /** 行番号の集合に属する文字（ベース面）を返す（ドリル用） */
  function charsInRows(rowIdxs) {
    return rowIdxs.flatMap((r) => [...rows[r]]);
  }

  return { rows, keys, keyByCode, keyByChar, charFromEvent, keyForChar, charsInRows };
}
