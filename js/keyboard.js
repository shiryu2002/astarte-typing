// 画面上のキーボード描画とハイライト。DOM 操作はこのモジュールに閉じる。
// クリック/タップでの入力も受け付け、onInput({ char, key }) で通知する。

// 見た目を整えるためのダミーキー（入力対象外）。幅は u 単位。
const GHOST_LEFT = [['Tab', 1.5], ['Caps', 1.75], null];
const GHOST_RIGHT = [
  [['[', 1], [']', 1], ['\\', 1.5]],
  [["'", 1], ['Enter', 2.25]],
  [],
];
const SHIFT_W = { left: 2.25, right: 2.75 };
const BOTTOM_ROW = [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]];
// スマホ向けコンパクト表示: ダミーキーなし、段ずれ控えめ、Shift は最下段
const COMPACT_ROW_OFFSET = [0, 0.25, 0.5];
const COMPACT_BOTTOM = { shift: 2.25, space: 6 };
const HOME_BUMP_COLS = [3, 6];
const FLASH_MS = 140;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function sizedKey(label, w, className) {
  const k = el('div', `key ${className}`, label);
  k.style.setProperty('--w', w);
  return k;
}

export function createKeyboard(container, initialLayout, { compact = false, onInput = null } = {}) {
  let layout = initialLayout;
  let isCompact = compact;
  let keyEls = new Map(); // code -> element
  let shiftEls = { left: null, right: null };
  let spaceEl = null;
  let nextEls = [];
  let shiftArmed = false; // 画面上の Shift をタップした直後（次の1キーだけ Shift 面）
  let hideLabels = false; // 文字を隠す（ブラインド練習）。次キーのハイライトも出さない

  function layoutKey(key, rowIdx) {
    const k = el('div', 'key');
    k.dataset.code = key.code;
    k.dataset.finger = key.finger;
    const isLetter = /[a-z]/.test(key.char);
    k.appendChild(el('span', 'main', isLetter ? key.char.toUpperCase() : key.char));
    if (!isLetter) k.appendChild(el('span', 'shifted', key.shifted));
    k.appendChild(el('span', 'qwerty', key.qwerty));
    if (rowIdx === 1 && HOME_BUMP_COLS.includes(key.col)) k.classList.add('home-bump');
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      emit(shiftArmed ? key.shifted : key.char, key);
    });
    keyEls.set(key.code, k);
    return k;
  }

  function shiftKey(side) {
    const k = sizedKey('Shift', isCompact ? COMPACT_BOTTOM.shift : SHIFT_W[side], 'mod shift');
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setShiftArmed(!shiftArmed);
    });
    shiftEls[side] = k;
    return k;
  }

  function spaceKey(w) {
    const k = sizedKey('Space', w, 'space');
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      emit(' ', null);
    });
    spaceEl = k;
    return k;
  }

  function emit(char, key) {
    setShiftArmed(false);
    if (onInput) onInput({ char, key });
  }

  function setShiftArmed(v) {
    shiftArmed = v;
    for (const s of Object.values(shiftEls)) s?.classList.toggle('armed', v);
  }

  function render() {
    container.innerHTML = '';
    container.classList.toggle('compact', isCompact);
    keyEls = new Map();
    shiftArmed = false;
    layout.rows.forEach((_, r) => {
      const row = el('div', 'kb-row');
      if (isCompact) {
        row.style.marginLeft = `calc(var(--u) * ${COMPACT_ROW_OFFSET[r]})`;
      } else {
        if (GHOST_LEFT[r]) row.appendChild(sizedKey(...GHOST_LEFT[r], 'ghost'));
        if (r === 2) row.appendChild(shiftKey('left'));
      }
      for (const key of layout.keys.filter((k) => k.row === r)) row.appendChild(layoutKey(key, r));
      if (!isCompact) {
        for (const g of GHOST_RIGHT[r]) row.appendChild(sizedKey(...g, 'ghost'));
        if (r === 2) row.appendChild(shiftKey('right'));
      }
      container.appendChild(row);
    });
    const bottom = el('div', 'kb-row');
    if (isCompact) {
      bottom.appendChild(shiftKey('left'));
      bottom.appendChild(spaceKey(COMPACT_BOTTOM.space));
      bottom.appendChild(shiftKey('right'));
    } else {
      for (const [label, w] of BOTTOM_ROW) {
        bottom.appendChild(label === 'Space' ? spaceKey(w) : sizedKey(label, w, 'ghost'));
      }
    }
    container.appendChild(bottom);
  }

  function clearNext() {
    for (const e of nextEls) e.classList.remove('next', 'next-shift');
    nextEls = [];
  }

  /** 次に打つ文字のキーを光らせる。Shift が要る場合は反対の手の Shift も光らせる。 */
  function highlightNext(char) {
    clearNext();
    if (hideLabels || char === null || char === undefined) return;
    const { key, shift, space } = layout.keyForChar(char);
    if (space) {
      spaceEl.classList.add('next');
      nextEls.push(spaceEl);
      return;
    }
    if (!key) return;
    const k = keyEls.get(key.code);
    k.classList.add('next');
    nextEls.push(k);
    if (shift) {
      const s = key.col < 5 ? shiftEls.right : shiftEls.left;
      s.classList.add('next-shift');
      nextEls.push(s);
    }
  }

  /** 押されたキーを一瞬光らせる（正解: hit / ミス: miss）。 */
  function flash(key, ok, { space = false } = {}) {
    const target = space ? spaceEl : key ? keyEls.get(key.code) : null;
    if (!target) return;
    const cls = ok ? 'hit' : 'miss';
    target.classList.remove('hit', 'miss');
    // reflow でアニメーションを再始動
    void target.offsetWidth;
    target.classList.add(cls);
    setTimeout(() => target.classList.remove(cls), FLASH_MS);
  }

  function setOptions({ showQwerty, showFingers, hideLabels: hide }) {
    container.classList.toggle('show-qwerty', !!showQwerty);
    container.classList.toggle('show-fingers', !!showFingers);
    container.classList.toggle('hide-labels', !!hide);
    hideLabels = !!hide;
  }

  function setLayout(next) {
    layout = next;
    render();
  }

  function setCompact(v) {
    if (v === isCompact) return;
    isCompact = v;
    render();
  }

  container.addEventListener('contextmenu', (e) => e.preventDefault()); // 長押しメニューを出さない
  render();
  return { highlightNext, flash, setOptions, setLayout, setCompact };
}
