// 日本語コーパスの読みが判定エンジンで扱えるか検証する。
//   node tools/validate-corpus.mjs                 # 標準コーパス全部
//   node tools/validate-corpus.mjs <file.js> ...   # 指定ファイル（{text,kana}[] を export しているもの）
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { canonicalRomaji } from '../js/romaji.js';

const KANA_ONLY = /^[ぁ-ゖ、。]+$/;
let bad = 0;
function check(label, items) {
  const seen = new Set();
  for (const { text, kana } of items) {
    const problems = [];
    if (!text || !kana) problems.push('text/kana が空');
    if (kana && !KANA_ONLY.test(kana)) problems.push('ひらがな・、。以外の文字を含む');
    if (kana && kana.includes('ー')) problems.push('長音「ー」を含む');
    if (text && /[0-9０-９a-zA-Zー]/.test(text)) problems.push('表示文に数字・英字・長音を含む');
    if (seen.has(text)) problems.push('重複');
    seen.add(text);
    try {
      const romaji = canonicalRomaji(kana ?? '');
      if (!/^[a-z,.]+$/.test(romaji)) problems.push(`ローマ字化できない文字: ${romaji.replace(/[a-z,.]/g, '')}`);
    } catch (e) {
      problems.push(`変換エラー: ${e.message}`);
    }
    if (problems.length) {
      bad++;
      console.log(`[${label}] ${text} / ${kana}: ${problems.join(', ')}`);
    }
  }
  console.log(`${label}: ${items.length} 件`);
}

const files = process.argv.slice(2);
const targets = files.length
  ? files
  : ['js/corpus/ja-words.js', 'js/corpus/ja-sentences.js'];
for (const f of targets) {
  const mod = await import(pathToFileURL(resolve(f)).href);
  for (const [name, value] of Object.entries(mod)) {
    if (Array.isArray(value)) check(`${f}#${name}`, value);
  }
}
console.log(bad === 0 ? 'OK' : `${bad} 件の問題`);
process.exit(bad === 0 ? 0 : 1);
