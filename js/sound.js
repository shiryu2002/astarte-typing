// 効果音（Web Audio API で合成。音声ファイル不要）。
// AudioContext はユーザー操作後にしか鳴らせないので、最初の再生時に遅延生成する。

export function createSounds(initialVolume = 0.5) {
  let ctx = null;
  let volume = clamp(initialVolume);

  function clamp(v) {
    return Math.min(1, Math.max(0, Number(v) || 0));
  }

  function ensureContext() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 鳴っている音。次の音と重なると加算されて大きく聞こえるので、新しい音を出す前に切る
  let current = null;

  function cutCurrent(ac, t0) {
    if (!current) return;
    const { osc, gain } = current;
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(gain.gain.value, t0);
    gain.gain.linearRampToValueAtTime(0, t0 + 0.005);
    osc.stop(t0 + 0.006);
    current = null;
  }

  /** 単純な減衰トーンを鳴らす。volume は 0..1（聴感に合わせて二乗で適用）。同時に1音だけ。 */
  function tone({ freq, type = 'sine', duration, peak = 0.3, freqEnd = null }) {
    if (volume <= 0) return;
    const ac = ensureContext();
    if (!ac) return;
    const t0 = ac.currentTime;
    cutCurrent(ac, t0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    const g = peak * volume * volume;
    gain.gain.setValueAtTime(g, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
    current = { osc, gain };
    osc.onended = () => {
      if (current && current.osc === osc) current = null;
    };
  }

  /** 正解: 短く高いクリック音 */
  function hit() {
    tone({ freq: 1400, type: 'triangle', duration: 0.04, peak: 0.25 });
  }

  /** ミス: 低めのビープ */
  function miss() {
    tone({ freq: 220, type: 'square', duration: 0.09, peak: 0.12, freqEnd: 160 });
  }

  function setVolume(v) {
    volume = clamp(v);
  }

  return { hit, miss, setVolume };
}
