// 画面上のキーボード描画とハイライト。DOM 操作はこのモジュールに閉じる。

// 見た目を整えるためのダミーキー（入力対象外）。幅は u 単位。
const GHOST_LEFT = [['Tab', 1.5], ['Caps', 1.75], null];
const GHOST_RIGHT = [
  [['[', 1], [']', 1], ['\\', 1.5]],
  [["'", 1], ['Enter', 2.25]],
  [],
];
const SHIFT_W = { left: 2.25, right: 2.75 };
const BOTTOM_ROW = [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]];
const HOME_BUMP_COLS = [3, 6];
const FLASH_MS = 140;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ghostKey(label, w) {
  const k = el('div', 'key ghost', label);
  k.style.setProperty('--w', w);
  return k;
}

export function createKeyboard(container, initialLayout) {
  let layout = initialLayout;
  let keyEls = new Map(); // code -> element
  let shiftEls = { left: null, right: null };
  let spaceEl = null;
  let nextEls = [];

  function render() {
    container.innerHTML = '';
    keyEls = new Map();
    layout.rows.forEach((_, r) => {
      const row = el('div', 'kb-row');
      if (GHOST_LEFT[r]) row.appendChild(ghostKey(...GHOST_LEFT[r]));
      if (r === 2) {
        shiftEls.left = ghostKey('Shift', SHIFT_W.left);
        shiftEls.left.classList.remove('ghost');
        shiftEls.left.classList.add('mod');
        row.appendChild(shiftEls.left);
      }
      for (const key of layout.keys.filter((k) => k.row === r)) {
        const k = el('div', 'key');
        k.dataset.code = key.code;
        k.dataset.finger = key.finger;
        const isLetter = /[a-z]/.test(key.char);
        k.appendChild(el('span', 'main', isLetter ? key.char.toUpperCase() : key.char));
        if (!isLetter) k.appendChild(el('span', 'shifted', key.shifted));
        k.appendChild(el('span', 'qwerty', key.qwerty));
        if (r === 1 && HOME_BUMP_COLS.includes(key.col)) k.classList.add('home-bump');
        keyEls.set(key.code, k);
        row.appendChild(k);
      }
      for (const g of GHOST_RIGHT[r]) row.appendChild(ghostKey(...g));
      if (r === 2) {
        shiftEls.right = ghostKey('Shift', SHIFT_W.right);
        shiftEls.right.classList.remove('ghost');
        shiftEls.right.classList.add('mod');
        row.appendChild(shiftEls.right);
      }
      container.appendChild(row);
    });
    const bottom = el('div', 'kb-row');
    for (const [label, w] of BOTTOM_ROW) {
      const k = ghostKey(label, w);
      if (label === 'Space') {
        k.classList.remove('ghost');
        k.classList.add('space');
        spaceEl = k;
      }
      bottom.appendChild(k);
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
    if (char === null || char === undefined) return;
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

  function setOptions({ showQwerty, showFingers }) {
    container.classList.toggle('show-qwerty', !!showQwerty);
    container.classList.toggle('show-fingers', !!showFingers);
  }

  function setLayout(next) {
    layout = next;
    render();
  }

  render();
  return { highlightNext, flash, setOptions, setLayout };
}
