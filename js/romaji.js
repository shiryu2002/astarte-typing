// ひらがな → ローマ字入力の判定エンジン。複数のローマ字表記（si/shi 等）を受け付ける。
// 表示用の「推奨表記」は各候補リストの先頭（原則として最短）を使う。

const TABLE = {
  あ: ['a'], い: ['i'], う: ['u'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['si', 'shi', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['ti', 'chi'], つ: ['tu', 'tsu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['hu', 'fu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['zi', 'ji'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], ゎ: ['xwa', 'lwa'],
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'], きぇ: ['kye'], きぃ: ['kyi'],
  しゃ: ['sya', 'sha'], しゅ: ['syu', 'shu'], しょ: ['syo', 'sho'], しぇ: ['sye', 'she'], しぃ: ['syi'],
  ちゃ: ['tya', 'cha', 'cya'], ちゅ: ['tyu', 'chu', 'cyu'], ちょ: ['tyo', 'cho', 'cyo'],
  ちぇ: ['tye', 'che', 'cye'], ちぃ: ['tyi', 'cyi'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'], にぇ: ['nye'], にぃ: ['nyi'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'], ひぇ: ['hye'], ひぃ: ['hyi'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'], みぇ: ['mye'], みぃ: ['myi'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'], りぇ: ['rye'], りぃ: ['ryi'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'], ぎぇ: ['gye'], ぎぃ: ['gyi'],
  じゃ: ['zya', 'ja', 'jya'], じゅ: ['zyu', 'ju', 'jyu'], じょ: ['zyo', 'jo', 'jyo'],
  じぇ: ['zye', 'je', 'jye'], じぃ: ['zyi', 'jyi'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'], ぢぇ: ['dye'], ぢぃ: ['dyi'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'], びぇ: ['bye'], びぃ: ['byi'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'], ぴぇ: ['pye'], ぴぃ: ['pyi'],
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'], ふゅ: ['fyu'],
  うぃ: ['wi'], うぇ: ['we'], うぉ: ['who'],
  てぃ: ['thi'], でぃ: ['dhi'], でゅ: ['dhu'], とぅ: ['twu'], どぅ: ['dwu'],
  ゔ: ['vu'],
  ー: ['-'], '、': [','], '。': ['.'], '？': ['?'], '！': ['!'], ' ': [' '], '　': [' '],
};

const SOKUON = 'っ';
const NN = 'ん';
const SOKUON_ALTS = ['xtu', 'ltu', 'xtsu', 'ltsu'];
const NN_ALTS = ['nn', 'xn'];
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/** ひらがな文字列を入力単位（1〜2文字）に分割する。 */
export function splitKana(text) {
  const units = [];
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two.length === 2 && TABLE[two]) {
      units.push(two);
      i += 2;
      continue;
    }
    units.push(text[i]);
    i += 1;
  }
  return units;
}

function baseAlts(unit) {
  if (unit === SOKUON) return SOKUON_ALTS;
  if (unit === NN) return NN_ALTS;
  return TABLE[unit] ?? [unit];
}

/**
 * i 番目の単位に対する受理候補（推奨順）。
 * っ: 次の単位の子音重ね（kka 等）を先頭に、xtu 等を後ろに。
 * ん: 次の単位が母音・な行・や行以外なら 'n' 1文字を先頭に許可。
 */
function altsAt(units, i) {
  const unit = units[i];
  const next = units[i + 1];
  if (unit === SOKUON) {
    const consonants = [];
    if (next && next !== SOKUON && next !== NN) {
      for (const alt of baseAlts(next)) {
        const c = alt[0];
        if (!VOWELS.has(c) && c !== 'n' && /[a-z]/.test(c) && !consonants.includes(c)) {
          consonants.push(c);
        }
      }
    }
    return [...consonants, ...SOKUON_ALTS];
  }
  if (unit === NN) {
    if (next && next !== NN) {
      const firsts = baseAlts(next).map((a) => a[0]);
      const singleOk = firsts.some((c) => !VOWELS.has(c) && c !== 'n' && c !== 'y' && /[a-z]/.test(c));
      if (singleOk) return ['n', ...NN_ALTS];
    }
    return NN_ALTS;
  }
  return baseAlts(unit);
}

/** 推奨表記でのローマ字全文（ドリルのフィルタ等に使う）。 */
export function canonicalRomaji(text) {
  const units = splitKana(text);
  return units.map((_, i) => altsAt(units, i)[0]).join('');
}

/**
 * 1語ぶんの入力状態。
 * input(ch) → 'ok' | 'miss' | 'done'
 */
export class RomajiMatcher {
  constructor(text) {
    this.units = splitKana(text);
    this.index = 0; // 現在の単位
    this.buffer = ''; // 現在の単位に対して打たれた文字
    this.committed = []; // 単位ごとに確定したローマ字
  }

  get done() {
    return this.index >= this.units.length;
  }

  alts(i = this.index) {
    return altsAt(this.units, i);
  }

  /** 現在の単位で、buffer に続く候補（推奨順）。 */
  candidate(i, buffer) {
    const alts = this.alts(i);
    return alts.find((a) => a.startsWith(buffer)) ?? alts[0];
  }

  /** 表示用ローマ字全文と、次に打つべき位置。 */
  view() {
    let text = this.committed.join('');
    const cursor = text.length + this.buffer.length;
    if (!this.done) {
      text += this.candidate(this.index, this.buffer);
      for (let i = this.index + 1; i < this.units.length; i++) {
        text += this.alts(i)[0];
      }
    }
    return { text, cursor, unitIndex: this.index };
  }

  expected() {
    const v = this.view();
    return v.text[v.cursor] ?? null;
  }

  /** 打鍵を試す。状態は受理された場合のみ変わる。 */
  input(ch) {
    const plan = this._plan(this.index, this.buffer, ch);
    if (!plan) return 'miss';
    for (const step of plan) {
      if (step.commit !== undefined) {
        this.committed.push(step.commit);
        this.index += 1;
        this.buffer = '';
      } else {
        this.buffer = step.buffer;
      }
    }
    return this.done ? 'done' : 'ok';
  }

  /**
   * (index, buffer) の状態で ch を打ったときに起きる状態変化の列。受理不能なら null。
   * ん の 'n' 単発のように「確定候補と延長候補が同時にある」場合は、
   * 次の打鍵が延長できなければ確定して次の単位に流す（遅延確定）。
   */
  _plan(index, buffer, ch) {
    if (index >= this.units.length) return null;
    const alts = this.alts(index);
    const nb = buffer + ch;
    const extendable = alts.filter((a) => a.startsWith(nb));
    if (extendable.length > 0) {
      const exact = alts.includes(nb);
      const longer = extendable.some((a) => a.length > nb.length);
      if (exact && !longer) return [{ commit: nb }];
      return [{ buffer: nb }];
    }
    if (buffer && alts.includes(buffer)) {
      const rest = this._plan(index + 1, '', ch);
      if (rest) return [{ commit: buffer }, ...rest];
    }
    return null;
  }
}
