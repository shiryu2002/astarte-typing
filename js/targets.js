// 1つの「お題」に対する入力判定の共通インターフェース。
//   expected(): 次に打つ文字 | null
//   input(ch): 'ok' | 'miss' | 'done'
//   view(): 描画用データ
import { RomajiMatcher } from './romaji.js';

export class PlainTarget {
  constructor(text) {
    this.text = text;
    this.pos = 0;
  }

  get done() {
    return this.pos >= this.text.length;
  }

  expected() {
    return this.text[this.pos] ?? null;
  }

  input(ch) {
    if (this.done || ch !== this.text[this.pos]) return 'miss';
    this.pos += 1;
    return this.done ? 'done' : 'ok';
  }

  view() {
    return { kind: 'plain', text: this.text, cursor: this.pos };
  }
}

export class RomajiTarget {
  /** @param {{text: string, kana: string}} item 表示文と読み */
  constructor(item) {
    this.display = item.text;
    this.kana = item.kana;
    this.matcher = new RomajiMatcher(item.kana);
  }

  get done() {
    return this.matcher.done;
  }

  expected() {
    return this.matcher.expected();
  }

  input(ch) {
    return this.matcher.input(ch);
  }

  view() {
    const v = this.matcher.view();
    return {
      kind: 'romaji',
      display: this.display,
      kanaUnits: this.matcher.units,
      unitIndex: v.unitIndex,
      text: v.text,
      cursor: v.cursor,
    };
  }
}
