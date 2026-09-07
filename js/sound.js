// 効果音（Web Audio API で合成。音声ファイル不要）。
// AudioContext はユーザー操作後にしか鳴らせないので、最初の再生時に遅延生成する。

export function createSounds(initialVolume = 0.5) {
  let ctx = null;
  let volume = clamp(initialVolume);
  let current = null; // 鳴っている音 { osc, gain }

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

  /** 鳴っている音を短く切る（重なって加算されるのを防ぐ）。AudioParam.value は自動化中の値を返さないことがあるので読まない。 */
  function cutCurrent(t0) {
    if (!current) return;
    const { osc, gain } = current;
    const p = gain.gain;
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t0);
    else p.cancelScheduledValues(t0);
    p.setTargetAtTime(0, t0, 0.002);
    osc.stop(t0 + 0.02);
    current = null;
  }

  /** 減衰トーンを1音鳴らす。volume は 0..1（聴感に合わせて二乗で適用）。 */
  function tone({ freq, type = 'sine', duration, peak = 0.3 }) {
    if (volume <= 0) return;
    const ac = ensureContext();
    if (!ac) return;
    const t0 = ac.currentTime;
    cutCurrent(t0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
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

  /** 正解: 高めの短いピッ */
  function hit() {
    tone({ freq: 880, type: 'sine', duration: 0.07, peak: 0.3 });
  }

  /**
   * ミス: 二連のピピッ。
   * 低域の矩形波ビープだと、再生環境によって直後の音が大きく聞こえる現象が出たので使わない。
   */
  function miss() {
    tone({ freq: 660, type: 'triangle', duration: 0.045, peak: 0.3 });
    setTimeout(() => tone({ freq: 660, type: 'triangle', duration: 0.045, peak: 0.3 }), 70);
  }

  /** お題完成: 上がる二音のピコン */
  function complete() {
    tone({ freq: 880, type: 'sine', duration: 0.09, peak: 0.3 });
    setTimeout(() => tone({ freq: 1320, type: 'sine', duration: 0.16, peak: 0.3 }), 80);
  }

  function setVolume(v) {
    volume = clamp(v);
  }

  return { hit, miss, complete, setVolume };
}
