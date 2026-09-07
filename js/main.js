// アプリ本体。状態（state）と UI 更新をここで束ねる。判定ロジックは targets/romaji、描画は keyboard に委譲。
import { createLayout, validateLayoutRows, DEFAULT_LAYOUT_ROWS, FINGER_LABEL } from './layout.js';
import { createKeyboard } from './keyboard.js';
import { createSounds } from './sound.js';
import { PlainTarget, RomajiTarget } from './targets.js';
import { RunStats, saveBestIfBetter } from './stats.js';
import { STAGES, lessonWords, shuffle } from './lessons.js';
import { EN_WORDS } from './corpus/en-words.js';
import { EN_SENTENCES } from './corpus/en-sentences.js';
import { JA_WORDS } from './corpus/ja-words.js';
import { JA_SENTENCES } from './corpus/ja-sentences.js';

// 既定値を変えたら版を上げる（古い保存値を引き継がないため）
const SETTINGS_KEY = 'astarte-typing:settings:v3';

const MODES = {
  lesson: { label: 'レッスン（段階ドリル）', count: 12 },
  'en-words': { label: '英単語', count: 20, perLine: 10 },
  'en-sentences': { label: '英文', count: 5 },
  'ja-words': { label: '日本語 単語', count: 15 },
  'ja-sentences': { label: '日本語 文', count: 5 },
};

const DEFAULT_SETTINGS = {
  showQwerty: true,
  showFingers: true,
  convert: true,
  endless: true,
  volume: 50, // 効果音 0..100
  layoutRows: DEFAULT_LAYOUT_ROWS,
  mode: 'ja-sentences',
  lessonStage: 'home',
  lessonLang: 'ja',
};

// ---- 状態 -------------------------------------------------------------------

const state = {
  settings: loadSettings(),
  layout: null,
  keyboard: null,
  sounds: null,
  run: null, // { items, index, stats, finished, modeKey, modeLabel }
  timer: null,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    if (validateLayoutRows(merged.layoutRows)) merged.layoutRows = DEFAULT_LAYOUT_ROWS;
    if (!MODES[merged.mode]) merged.mode = DEFAULT_SETTINGS.mode;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* ignore */
  }
}

// ---- DOM --------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const dom = {
  mode: $('#mode'),
  lessonOpts: $('#lesson-opts'),
  stage: $('#stage'),
  lang: $('#lang'),
  restart: $('#restart'),
  showQwerty: $('#opt-qwerty'),
  showFingers: $('#opt-fingers'),
  convert: $('#opt-convert'),
  endless: $('#opt-endless'),
  volume: $('#opt-volume'),
  volumeValue: $('#opt-volume-value'),
  layoutToggle: $('#layout-toggle'),
  layoutPanel: $('#layout-panel'),
  layoutRows: [$('#row0'), $('#row1'), $('#row2')],
  layoutApply: $('#layout-apply'),
  layoutReset: $('#layout-reset'),
  layoutError: $('#layout-error'),
  progress: $('#progress'),
  progressBar: $('#progress-bar'),
  time: $('#stat-time'),
  kpm: $('#stat-kpm'),
  miss: $('#stat-miss'),
  acc: $('#stat-acc'),
  text: $('#text'),
  hint: $('#hint'),
  ime: $('#ime-warning'),
  keyboard: $('#keyboard'),
  result: $('#result'),
  resultBody: $('#result-body'),
  resultAgain: $('#result-again'),
  resultClose: $('#result-close'),
};

// ---- お題生成 ----------------------------------------------------------------

// コーパスごとにシャッフル済みの山札を持ち、使い切るまで同じお題を出さない
const decks = new Map();
function draw(key, pool, n) {
  let d = decks.get(key);
  if (!d || d.pool !== pool) {
    d = { pool, order: shuffle(pool), pos: 0 };
    decks.set(key, d);
  }
  const out = [];
  while (out.length < n) {
    if (d.pos >= d.order.length) {
      d.order = shuffle(pool);
      d.pos = 0;
    }
    out.push(d.order[d.pos++]);
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildItems() {
  const { mode, lessonStage, lessonLang } = state.settings;
  const cfg = MODES[mode];
  switch (mode) {
    case 'lesson': {
      const stage = STAGES.find((s) => s.id === lessonStage) ?? STAGES[0];
      const words = lessonWords(state.layout, stage, lessonLang, cfg.count);
      if (lessonLang === 'ja') return words.map((w) => new RomajiTarget(w));
      return chunk(words, 6).map((ws) => new PlainTarget(ws.join(' ')));
    }
    case 'en-words':
      return chunk(draw(mode, EN_WORDS, cfg.count), cfg.perLine).map((ws) => new PlainTarget(ws.join(' ')));
    case 'en-sentences':
      return draw(mode, EN_SENTENCES, cfg.count).map((s) => new PlainTarget(s));
    case 'ja-words':
      return draw(mode, JA_WORDS, cfg.count).map((w) => new RomajiTarget(w));
    case 'ja-sentences':
      return draw(mode, JA_SENTENCES, cfg.count).map((s) => new RomajiTarget(s));
    default:
      throw new Error(`unknown mode: ${mode}`);
  }
}

function modeKey() {
  const { mode, lessonStage, lessonLang, endless } = state.settings;
  const base = mode === 'lesson' ? `lesson:${lessonStage}:${lessonLang}` : mode;
  return endless ? `${base}:endless` : base;
}

function modeLabel() {
  const { mode, lessonStage, lessonLang, endless } = state.settings;
  const suffix = endless ? '（エンドレス）' : '';
  if (mode !== 'lesson') return MODES[mode].label + suffix;
  const stage = STAGES.find((s) => s.id === lessonStage) ?? STAGES[0];
  return `レッスン / ${stage.label} / ${lessonLang === 'ja' ? '日本語' : '英語'}${suffix}`;
}

// ---- ラン制御 ----------------------------------------------------------------

function startRun() {
  stopTimer();
  hideResult();
  state.run = {
    items: buildItems(),
    index: 0,
    stats: new RunStats(),
    finished: false,
    endless: state.settings.endless,
    modeKey: modeKey(),
    modeLabel: modeLabel(),
  };
  renderAll();
}

function currentTarget() {
  const run = state.run;
  return run && !run.finished ? run.items[run.index] : null;
}

function handleChar(char, physicalKey) {
  const run = state.run;
  const target = currentTarget();
  if (!target) return;
  const expected = target.expected();
  if (!run.stats.started) {
    run.stats.startIfNeeded();
    startTimer();
  }
  const result = target.input(char);
  const ok = result !== 'miss';
  run.stats.record(expected, ok);
  state.keyboard.flash(physicalKey, ok, { space: char === ' ' });
  if (ok) state.sounds.hit();
  else state.sounds.miss();
  if (!ok) {
    dom.text.classList.remove('shake');
    void dom.text.offsetWidth;
    dom.text.classList.add('shake');
  }
  if (result === 'done') {
    run.index += 1;
    if (run.index >= run.items.length) {
      if (!run.endless) {
        finishRun();
        return;
      }
      run.items.push(...buildItems());
    }
  }
  renderAll();
}

function finishRun() {
  const run = state.run;
  run.finished = true;
  run.stats.finish();
  stopTimer();
  renderAll();
  showResult();
}

function startTimer() {
  stopTimer();
  state.timer = setInterval(renderStats, 200);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

// ---- 描画 -----------------------------------------------------------------------

function renderAll() {
  renderText();
  renderStats();
  const target = currentTarget();
  state.keyboard.highlightNext(target ? target.expected() : null);
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function renderChars(container, text, cursor) {
  container.innerHTML = '';
  [...text].forEach((ch, i) => {
    const cls = i < cursor ? 'done' : i === cursor ? 'cur' : 'todo';
    const s = span(cls, ch);
    if (ch === ' ') s.classList.add('space');
    container.appendChild(s);
  });
}

function renderText() {
  const target = currentTarget();
  dom.text.innerHTML = '';
  if (!target) {
    dom.text.appendChild(span('placeholder', 'Enter でスタート'));
    return;
  }
  const v = target.view();
  if (v.kind === 'romaji') {
    dom.text.appendChild(span('ja-display', v.display));
    const kana = document.createElement('div');
    kana.className = 'ja-kana';
    v.kanaUnits.forEach((u, i) => {
      kana.appendChild(span(i < v.unitIndex ? 'done' : i === v.unitIndex ? 'cur' : 'todo', u));
    });
    dom.text.appendChild(kana);
  }
  const line = document.createElement('div');
  line.className = 'line';
  renderChars(line, v.text, v.cursor);
  dom.text.appendChild(line);
}

function progressRatio() {
  const run = state.run;
  if (!run) return 0;
  if (run.finished) return 1;
  const t = run.items[run.index];
  const v = t.view();
  const frac = v.text.length ? v.cursor / v.text.length : 0;
  // エンドレスは終わりがないので、今のお題の中での進み具合を出す
  return run.endless ? frac : (run.index + frac) / run.items.length;
}

function fmtTime(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderStats() {
  const run = state.run;
  if (!run) return;
  const s = run.stats;
  dom.progress.textContent = run.endless
    ? `${run.index} 完了`
    : `${Math.min(run.index + (run.finished ? 0 : 1), run.items.length)} / ${run.items.length}`;
  dom.progressBar.style.width = `${(progressRatio() * 100).toFixed(1)}%`;
  dom.time.textContent = fmtTime(s.elapsedMs());
  // 計測直後は分母が小さすぎて値が暴れるので 1 秒経つまで伏せる
  dom.kpm.textContent = s.started && s.elapsedMs() >= 1000 ? Math.round(s.kpm()) : '-';
  dom.miss.textContent = s.miss;
  dom.acc.textContent = `${(s.accuracy() * 100).toFixed(1)}%`;
}

function showResult() {
  const run = state.run;
  const s = run.stats;
  const result = { kpm: Math.round(s.kpm()), acc: s.accuracy(), time: s.elapsedMs(), at: Date.now() };
  const { updated, prev } = saveBestIfBetter(run.modeKey, result);
  const worst = s.worstKeys(5);
  const fingerOf = (ch) => {
    if (ch === '␣') return '親指';
    const { key } = state.layout.keyForChar(ch);
    return key ? FINGER_LABEL[key.finger] : '-';
  };
  dom.resultBody.innerHTML = `
    <p class="result-mode">${escapeHtml(run.modeLabel)}</p>
    <dl class="result-grid">
      <div><dt>時間</dt><dd>${fmtTime(s.elapsedMs())}</dd></div>
      <div><dt>KPM（正打鍵/分）</dt><dd>${result.kpm}</dd></div>
      <div><dt>WPM（英換算）</dt><dd>${Math.round(s.wpm())}</dd></div>
      <div><dt>正確率</dt><dd>${(s.accuracy() * 100).toFixed(1)}%</dd></div>
      <div><dt>正打鍵</dt><dd>${s.correct}</dd></div>
      <div><dt>ミス</dt><dd>${s.miss}</dd></div>
    </dl>
    <p class="result-best">${
      updated
        ? `🏆 自己ベスト更新！${prev ? `（前回 ${prev.kpm} KPM）` : ''}`
        : `自己ベスト: ${prev.kpm} KPM / ${(prev.acc * 100).toFixed(1)}%`
    }</p>
    ${
      worst.length
        ? `<h3>苦手キー</h3><ul class="worst">${worst
            .map((w) => `<li><kbd>${escapeHtml(w.char)}</kbd> ミス ${w.miss} 回 <span class="finger">${fingerOf(w.char)}</span></li>`)
            .join('')}</ul>`
        : '<p class="result-perfect">ノーミス！ 🎉</p>'
    }
  `;
  dom.result.hidden = false;
  dom.resultAgain.focus();
}

function hideResult() {
  dom.result.hidden = true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---- 設定 UI -------------------------------------------------------------------

function applySettingsToUi() {
  const s = state.settings;
  dom.mode.value = s.mode;
  dom.stage.value = s.lessonStage;
  dom.lang.value = s.lessonLang;
  dom.lessonOpts.hidden = s.mode !== 'lesson';
  dom.showQwerty.checked = s.showQwerty;
  dom.showFingers.checked = s.showFingers;
  dom.convert.checked = s.convert;
  dom.endless.checked = s.endless;
  dom.volume.value = s.volume;
  dom.volumeValue.textContent = s.volume;
  state.sounds.setVolume(s.volume / 100);
  s.layoutRows.forEach((r, i) => (dom.layoutRows[i].value = r));
  state.keyboard.setOptions({ showQwerty: s.showQwerty, showFingers: s.showFingers });
}

function applyLayout(rows) {
  const err = validateLayoutRows(rows);
  dom.layoutError.textContent = err ?? '';
  if (err) return false;
  state.settings.layoutRows = rows;
  state.layout = createLayout(rows);
  state.keyboard.setLayout(state.layout);
  saveSettings();
  applySettingsToUi();
  startRun();
  return true;
}

function bindUi() {
  dom.mode.addEventListener('change', () => {
    state.settings.mode = dom.mode.value;
    saveSettings();
    applySettingsToUi();
    startRun();
  });
  dom.stage.addEventListener('change', () => {
    state.settings.lessonStage = dom.stage.value;
    saveSettings();
    startRun();
  });
  dom.lang.addEventListener('change', () => {
    state.settings.lessonLang = dom.lang.value;
    saveSettings();
    startRun();
  });
  dom.restart.addEventListener('click', startRun);
  dom.showQwerty.addEventListener('change', () => {
    state.settings.showQwerty = dom.showQwerty.checked;
    saveSettings();
    applySettingsToUi();
  });
  dom.showFingers.addEventListener('change', () => {
    state.settings.showFingers = dom.showFingers.checked;
    saveSettings();
    applySettingsToUi();
  });
  dom.convert.addEventListener('change', () => {
    state.settings.convert = dom.convert.checked;
    saveSettings();
  });
  dom.volume.addEventListener('input', () => {
    state.settings.volume = Number(dom.volume.value);
    dom.volumeValue.textContent = state.settings.volume;
    state.sounds.setVolume(state.settings.volume / 100);
  });
  dom.volume.addEventListener('change', () => {
    saveSettings();
    state.sounds.hit(); // 音量の確認用に一度鳴らす
    dom.volume.blur();
  });
  dom.endless.addEventListener('change', () => {
    state.settings.endless = dom.endless.checked;
    saveSettings();
    startRun();
  });
  dom.layoutToggle.addEventListener('click', () => {
    dom.layoutPanel.hidden = !dom.layoutPanel.hidden;
  });
  dom.layoutApply.addEventListener('click', () => {
    applyLayout(dom.layoutRows.map((i) => i.value.trim().toLowerCase()));
  });
  dom.layoutReset.addEventListener('click', () => applyLayout(DEFAULT_LAYOUT_ROWS));
  dom.resultAgain.addEventListener('click', startRun);
  dom.resultClose.addEventListener('click', hideResult);
  // フォーカスが残っていると入力を奪うので外す。
  // select は click で blur するとプルダウンが即閉じるので change のみ。
  for (const e of [dom.mode, dom.stage, dom.lang, dom.showQwerty, dom.showFingers, dom.convert, dom.endless]) {
    e.addEventListener('change', () => e.blur());
  }
  for (const e of [dom.restart, dom.layoutToggle]) {
    e.addEventListener('click', () => e.blur());
  }
}

// ---- キー入力 --------------------------------------------------------------------

function isEditableTarget(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

let imeTimer = null;
function showImeWarning() {
  dom.ime.hidden = false;
  clearTimeout(imeTimer);
  imeTimer = setTimeout(() => (dom.ime.hidden = true), 3000);
}

function onKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isEditableTarget(e.target)) return;

  if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
    showImeWarning();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    const run = state.run;
    if (!dom.result.hidden) hideResult();
    else if (run && run.endless && run.stats.started && !run.finished) finishRun(); // エンドレスは Esc で締めて結果を見る
    else startRun();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    startRun();
    return;
  }
  if (!dom.result.hidden) return;

  const input = state.layout.charFromEvent(e, state.settings.convert);
  if (!input) return;
  e.preventDefault();
  handleChar(input.char, input.key);
}

// ---- 起動 ---------------------------------------------------------------------------

function init() {
  state.layout = createLayout(state.settings.layoutRows);
  state.keyboard = createKeyboard(dom.keyboard, state.layout);
  state.sounds = createSounds(state.settings.volume / 100);
  for (const s of STAGES) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    dom.stage.appendChild(o);
  }
  for (const [id, m] of Object.entries(MODES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = m.label;
    dom.mode.appendChild(o);
  }
  applySettingsToUi();
  bindUi();
  window.addEventListener('keydown', onKeyDown);
  startRun();
}

init();
