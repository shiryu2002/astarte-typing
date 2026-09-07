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
      startKeepAlive(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /**
   * ごく小さなノイズを常時流し、出力を「無音」にしない。
   * 無音が続くと省電力で止まり、次の音の頭が跳ねる/欠ける機器（Bluetooth・一部 DSP）への対策。
   * 振幅 0.0005（約 -66 dBFS）で聴感上は無音。
   */
  function startKeepAlive(ac) {
    const seconds = 2;
    const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0005;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ac.destination);
    src.start();
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
    tone({ freq: 220, type: 'square', duration: 0.12, peak: 0.18, freqEnd: 160 });
  }

  function setVolume(v) {
    volume = clamp(v);
  }

  /** 聞き比べ用: 正解→正解→ミス→正解→ミス→ミス→正解 を 1 秒間隔で鳴らす。 */
  function playTest() {
    const seq = [hit, hit, miss, hit, miss, miss, hit];
    seq.forEach((fn, i) => setTimeout(fn, i * 1000));
  }

  return { hit, miss, setVolume, playTest };
}
