// 日本語文コーパスの集約。話題別ファイルを結合し、表示文が重複するものは先勝ちで除く。
import { JA_SENTENCES_GENERAL } from './ja-sentences-general.js';
import { JA_SENTENCES_DAILY } from './ja-sentences-daily.js';
import { JA_SENTENCES_WORK } from './ja-sentences-work.js';
import { JA_SENTENCES_LEISURE } from './ja-sentences-leisure.js';
import { JA_SENTENCES_LITERARY } from './ja-sentences-literary.js';

function dedupe(lists) {
  const seen = new Set();
  const out = [];
  for (const item of lists.flat()) {
    if (seen.has(item.text)) continue;
    seen.add(item.text);
    out.push(item);
  }
  return out;
}

export const JA_SENTENCES = dedupe([
  JA_SENTENCES_GENERAL,
  JA_SENTENCES_DAILY,
  JA_SENTENCES_WORK,
  JA_SENTENCES_LEISURE,
  JA_SENTENCES_LITERARY,
]);
