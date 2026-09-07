// 効果音（Web Audio API で合成。音声ファイル不要）。
// AudioContext はユーザー操作後にしか鳴らせないので、最初の再生時に遅延生成する。

const ATTACK = 0.003; // 立ち上がりを付けてポップノイズを防ぐ

export function createSounds(initialVolume = 0.5) {
  let ctx = null;
  let master = null;
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
      // 複数音が重なっても音量が跳ねないようにコンプレッサを挟む
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -24;
      master.knee.value = 12;
      master.ratio.value = 6;
      master.attack.value = 0.001;
      master.release.value = 0.05;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 鳴っている音を短く切る。AudioParam.value は自動化中の値を返さないことがあるので読まない。 */
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
  function tone({ freq, type = 'sine', duration, peak = 0.3, freqEnd = null }) {
    if (volume <= 0) return;
    const ac = ensureContext();
    if (!ac) return;
    const t0 = ac.currentTime;
    cutCurrent(t0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    const g = peak * volume * volume;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(g, t0 + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(master);
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

  /** ミス: 低めの短いビープ（角の立たない三角波） */
  function miss() {
    tone({ freq: 220, type: 'triangle', duration: 0.09, peak: 0.3, freqEnd: 150 });
  }

  function setVolume(v) {
    volume = clamp(v);
  }

  return { hit, miss, setVolume };
}
