// 1回のプレイの計測。時間・打鍵数・ミス・キー別ミス。
export class RunStats {
  constructor() {
    this.startedAt = null;
    this.finishedAt = null;
    this.correct = 0;
    this.miss = 0;
    this.missByChar = new Map();
    this.hitByChar = new Map();
  }

  get started() {
    return this.startedAt !== null;
  }

  startIfNeeded(now = performance.now()) {
    if (this.startedAt === null) this.startedAt = now;
  }

  record(expected, ok) {
    const key = expected === ' ' ? '␣' : expected;
    if (ok) {
      this.correct += 1;
      this.hitByChar.set(key, (this.hitByChar.get(key) ?? 0) + 1);
    } else {
      this.miss += 1;
      this.missByChar.set(key, (this.missByChar.get(key) ?? 0) + 1);
    }
  }

  finish(now = performance.now()) {
    this.finishedAt = now;
  }

  elapsedMs(now = performance.now()) {
    if (this.startedAt === null) return 0;
    return (this.finishedAt ?? now) - this.startedAt;
  }

  /** 正打鍵/分 */
  kpm(now) {
    const min = this.elapsedMs(now) / 60000;
    return min > 0 ? this.correct / min : 0;
  }

  /** 英文換算 WPM（5打鍵=1語） */
  wpm(now) {
    return this.kpm(now) / 5;
  }

  accuracy() {
    const total = this.correct + this.miss;
    return total > 0 ? this.correct / total : 1;
  }

  /** ミスの多いキー上位 */
  worstKeys(n = 5) {
    return [...this.missByChar.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([char, miss]) => ({ char, miss, hit: this.hitByChar.get(char) ?? 0 }));
  }
}

const BEST_KEY = 'astarte-typing:best';

export function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** モードごとの自己ベスト（KPM基準）。更新したら true。 */
export function saveBestIfBetter(modeKey, result) {
  const best = loadBest();
  const prev = best[modeKey];
  if (prev && prev.kpm >= result.kpm) return { updated: false, prev };
  best[modeKey] = result;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* ignore */
  }
  return { updated: true, prev };
}
