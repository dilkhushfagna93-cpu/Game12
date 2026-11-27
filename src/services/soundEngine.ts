/**
 * Procedural Web Audio API sound effects & ambient music synthesizer.
 * Zero external audio file dependencies; respects browser autoplay policies.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private musicEnabled = false;
  private volume = 0.65;

  // Continuous Aviator engine nodes
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Ambient music pad nodes
  private musicOscs: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public configure(opts: { soundEnabled?: boolean; musicEnabled?: boolean; volume?: number }) {
    if (typeof opts.soundEnabled === 'boolean') {
      this.soundEnabled = opts.soundEnabled;
      if (!this.soundEnabled) this.stopEngine();
    }
    if (typeof opts.volume === 'number') {
      this.volume = Math.max(0, Math.min(1, opts.volume));
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(this.musicEnabled ? this.volume * 0.06 : 0, this.ctx.currentTime, 0.1);
      }
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(this.soundEnabled ? this.volume * 0.08 : 0, this.ctx.currentTime, 0.08);
      }
    }
    if (typeof opts.musicEnabled === 'boolean') {
      this.musicEnabled = opts.musicEnabled;
      if (this.musicEnabled) {
        this.startAmbientMusic();
      } else {
        this.stopAmbientMusic();
      }
    }
  }

  public getState() {
    return {
      soundEnabled: this.soundEnabled,
      musicEnabled: this.musicEnabled,
      volume: this.volume,
    };
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainScale = 0.25,
    delay = 0,
  ) {
    if (!this.soundEnabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainScale * this.volume, now + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq: number, gainScale = 0.18, delay = 0) {
    if (!this.soundEnabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.45));
    }

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainScale * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  public unlock() {
    this.ensureContext();
  }

  private speakCallout(phrase: string) {
    if (!this.soundEnabled || this.volume <= 0 || typeof window === 'undefined') return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(phrase);
      utter.volume = Math.min(1, Math.max(0.2, this.volume));
      utter.rate = 1.08;
      utter.pitch = 1.02;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore speech synthesis restrictions in sandboxed iframes
    }
  }

  public playClick() {
    this.playTone(680, 420, 0.055, 'triangle', 0.12);
  }

  private lastChipSoundTime = 0;

  private playCoinClink(level = 1) {
    if (!this.soundEnabled || this.volume <= 0) return;

    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (perfNow - this.lastChipSoundTime < 90) return; // 90ms anti-distortion throttle
    this.lastChipSoundTime = perfNow;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const jitter = 0.97 + Math.random() * 0.06;

    // Master gain strictly capped <= 0.22 for clean, natural coin clink without clipping
    const master = ctx.createGain();
    const targetGain = Math.min(0.22, 0.21 * level * this.volume);
    master.gain.setValueAtTime(targetGain, now);
    master.connect(ctx.destination);

    // 1. Primary metallic/ceramic coin resonance (~2200Hz, crisp 55ms exponential decay)
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2200 * jitter, now);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.linearRampToValueAtTime(0.62, now + 0.002);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.057);
    osc1.connect(g1);
    g1.connect(master);
    osc1.start(now);
    osc1.stop(now + 0.062);

    // 2. High-frequency harmonic shimmer (~4400Hz, crisp 55ms exponential decay)
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(4400 * jitter, now);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(0.36, now + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc2.connect(g2);
    g2.connect(master);
    osc2.start(now);
    osc2.stop(now + 0.06);

    // 3. Subtle 15ms impact transient (bandpass-filtered tap on felt/chip stack)
    const transientDuration = 0.015;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * transientDuration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.32));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200 * jitter, now);
    filter.Q.setValueAtTime(1.6, now);

    const gNoise = ctx.createGain();
    gNoise.gain.setValueAtTime(0.28, now);
    gNoise.gain.exponentialRampToValueAtTime(0.0001, now + transientDuration);

    noiseSrc.connect(filter);
    filter.connect(gNoise);
    gNoise.connect(master);
    noiseSrc.start(now);
  }

  public playChipPlace() {
    this.playCoinClink(1.0);
  }

  public playSoftTableChip() {
    this.playCoinClink(0.75);
  }

  public playCountdownTick(urgent = false) {
    if (urgent) {
      this.playTone(1180, 880, 0.09, 'triangle', 0.22);
      this.playTone(1760, 1320, 0.06, 'sine', 0.12, 0.015);
    } else {
      this.playTone(760, 620, 0.05, 'sine', 0.1);
    }
  }

  public playBettingStart(announceVoice = true) {
    // Royal Dragon Tiger "Start Betting" rising casino bell
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.005, 0.22, 'triangle', 0.18, idx * 0.055);
    });
    this.playTone(196, 130.81, 0.38, 'sine', 0.16, 0);
    if (announceVoice) {
      this.speakCallout('Start betting');
    }
  }

  public playBettingStop(announceVoice = true) {
    // Classic Dragon Tiger double casino gong + stop chime
    this.playTone(880, 660, 0.16, 'triangle', 0.22, 0);
    this.playTone(660, 440, 0.28, 'triangle', 0.24, 0.13);
    this.playTone(165, 98, 0.42, 'sine', 0.2, 0.05);
    if (announceVoice) {
      this.speakCallout('Stop betting');
    }
  }

  public playCardDeal() {
    this.playNoise(0.12, 2400, 0.26);
    this.playTone(260, 165, 0.08, 'sine', 0.1);
  }

  public playCardFlip() {
    this.playNoise(0.11, 3400, 0.28);
    this.playTone(480, 840, 0.09, 'triangle', 0.16);
    this.playTone(960, 1240, 0.06, 'sine', 0.1, 0.03);
  }

  public playCardFold() {
    this.playNoise(0.14, 1500, 0.2);
    this.playTone(340, 180, 0.14, 'sine', 0.12);
  }

  public playSideShowChime() {
    this.playTone(622.25, 622.25, 0.14, 'triangle', 0.18, 0);
    this.playTone(932.33, 932.33, 0.22, 'triangle', 0.2, 0.09);
  }

  public playShowdownReveal() {
    this.playNoise(0.12, 3200, 0.24, 0);
    this.playNoise(0.12, 3500, 0.24, 0.08);
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.004, 0.34, 'triangle', 0.16, 0.06 + idx * 0.055);
    });
  }

  public playTipDealer() {
    this.playTone(1567.98, 2093.0, 0.12, 'sine', 0.18, 0);
    this.playTone(2093.0, 2637.02, 0.18, 'sine', 0.15, 0.07);
  }

  private createSoftClipCurve(drive = 22): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + drive) * x * 20 * (Math.PI / 180)) / (Math.PI + drive * Math.abs(x));
    }
    return curve;
  }

  /**
   * Loud, guttural, cinema-grade Bengal Tiger roar:
   * combines vocal-cord flutter AM/FM, distorted chest fundamental, dual jaw-opening
   * vocal formants, and breathy snarl noise pushed through a dynamics compressor.
   */
  public playTigerRoar() {
    if (!this.soundEnabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = 1.48;
    const vol = Math.min(1, Math.max(0.25, this.volume));

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, now);
    compressor.knee.setValueAtTime(14, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.004, now);
    compressor.release.setValueAtTime(0.18, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(vol * 0.92, now + 0.09);
    masterGain.gain.setValueAtTime(vol * 0.95, now + 0.42);
    masterGain.gain.linearRampToValueAtTime(vol * 0.72, now + 0.92);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // 1. Distorted guttural vocal cords with throat flutter LFO
    const vocalOsc1 = ctx.createOscillator();
    const vocalOsc2 = ctx.createOscillator();
    const subGrowl = ctx.createOscillator();
    vocalOsc1.type = 'sawtooth';
    vocalOsc2.type = 'sawtooth';
    subGrowl.type = 'triangle';

    // Classic tiger roar pitch arc: fierce attack surge -> open-mouth peak -> deep chest drop
    vocalOsc1.frequency.setValueAtTime(128, now);
    vocalOsc1.frequency.exponentialRampToValueAtTime(178, now + 0.22);
    vocalOsc1.frequency.exponentialRampToValueAtTime(118, now + 0.65);
    vocalOsc1.frequency.exponentialRampToValueAtTime(62, now + dur);

    vocalOsc2.frequency.setValueAtTime(192, now);
    vocalOsc2.frequency.exponentialRampToValueAtTime(248, now + 0.24);
    vocalOsc2.frequency.exponentialRampToValueAtTime(146, now + 0.7);
    vocalOsc2.frequency.exponentialRampToValueAtTime(84, now + dur);

    subGrowl.frequency.setValueAtTime(76, now);
    subGrowl.frequency.exponentialRampToValueAtTime(92, now + 0.2);
    subGrowl.frequency.exponentialRampToValueAtTime(42, now + dur);

    // Rapid throat rasp / growl rattle LFO (28–38 Hz) modulating frequency & amplitude
    const raspLfo = ctx.createOscillator();
    const raspFreqGain = ctx.createGain();
    raspLfo.type = 'sine';
    raspLfo.frequency.setValueAtTime(36, now);
    raspLfo.frequency.linearRampToValueAtTime(24, now + dur);
    raspFreqGain.gain.setValueAtTime(28, now);
    raspFreqGain.gain.linearRampToValueAtTime(14, now + dur);
    raspLfo.connect(raspFreqGain);
    raspFreqGain.connect(vocalOsc1.frequency);
    raspFreqGain.connect(vocalOsc2.frequency);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.createSoftClipCurve(28);
    shaper.oversample = '2x';

    // 2. Breathy snarl noise generator
    const sampleCount = Math.floor(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const nData = noiseBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < sampleCount; i++) {
      // Pink-ish warm breath noise with throat modulation
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.08 * white) / 1.08;
      const t = i / ctx.sampleRate;
      const raspMod = 0.68 + 0.32 * Math.sin(2 * Math.PI * 30 * t);
      nData[i] = (lastOut * 3.4 + white * 0.42) * raspMod;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    // 3. Dual parallel vocal-tract formant filters ("RROOAAARRR")
    const formant1 = ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.Q.setValueAtTime(2.6, now);
    formant1.frequency.setValueAtTime(360, now);
    formant1.frequency.exponentialRampToValueAtTime(640, now + 0.25);
    formant1.frequency.exponentialRampToValueAtTime(290, now + dur);

    const formant2 = ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.Q.setValueAtTime(3.2, now);
    formant2.frequency.setValueAtTime(920, now);
    formant2.frequency.exponentialRampToValueAtTime(1520, now + 0.28);
    formant2.frequency.exponentialRampToValueAtTime(680, now + dur);

    const chestLow = ctx.createBiquadFilter();
    chestLow.type = 'lowpass';
    chestLow.frequency.setValueAtTime(240, now);

    const f1Gain = ctx.createGain();
    f1Gain.gain.setValueAtTime(0.95, now);
    const f2Gain = ctx.createGain();
    f2Gain.gain.setValueAtTime(0.65, now);
    const chestGain = ctx.createGain();
    chestGain.gain.setValueAtTime(0.8, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75, now);

    vocalOsc1.connect(shaper);
    vocalOsc2.connect(shaper);
    shaper.connect(formant1);
    shaper.connect(formant2);

    noiseSrc.connect(noiseGain);
    noiseGain.connect(formant1);
    noiseGain.connect(formant2);

    subGrowl.connect(chestLow);
    chestLow.connect(chestGain);

    formant1.connect(f1Gain);
    formant2.connect(f2Gain);

    f1Gain.connect(compressor);
    f2Gain.connect(compressor);
    chestGain.connect(compressor);

    vocalOsc1.start(now);
    vocalOsc2.start(now);
    subGrowl.start(now);
    raspLfo.start(now);
    noiseSrc.start(now);

    const stopAt = now + dur + 0.05;
    vocalOsc1.stop(stopAt);
    vocalOsc2.stop(stopAt);
    subGrowl.stop(stopAt);
    raspLfo.stop(stopAt);
    noiseSrc.stop(stopAt);
  }

  /**
   * Mythical Dragon bellow + blazing fire-breath flamethrower roar & crackling flames.
   */
  public playDragonFireRoar() {
    if (!this.soundEnabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = 1.85;
    const vol = Math.min(1, Math.max(0.25, this.volume));

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-15, now);
    compressor.ratio.setValueAtTime(6, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(vol * 0.88, now + 0.14);
    masterGain.gain.setValueAtTime(vol * 0.85, now + 1.05);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // 1. Deep mythical dragon throat bellow
    const bellow = ctx.createOscillator();
    const bellowSub = ctx.createOscillator();
    bellow.type = 'sawtooth';
    bellowSub.type = 'sine';
    bellow.frequency.setValueAtTime(118, now);
    bellow.frequency.exponentialRampToValueAtTime(64, now + 0.65);
    bellow.frequency.exponentialRampToValueAtTime(44, now + 1.35);
    bellowSub.frequency.setValueAtTime(62, now);
    bellowSub.frequency.exponentialRampToValueAtTime(34, now + 1.35);

    const bellowFilter = ctx.createBiquadFilter();
    bellowFilter.type = 'lowpass';
    bellowFilter.frequency.setValueAtTime(520, now);
    bellowFilter.frequency.exponentialRampToValueAtTime(180, now + 1.35);

    const bellowGain = ctx.createGain();
    bellowGain.gain.setValueAtTime(0.55, now);
    bellowGain.gain.exponentialRampToValueAtTime(0.01, now + 1.45);

    bellow.connect(bellowFilter);
    bellowSub.connect(bellowFilter);
    bellowFilter.connect(bellowGain);
    bellowGain.connect(compressor);

    // 2. Blazing Dragon Fire Breath jet (swept broadband fire roar + crackles)
    const sampleCount = Math.floor(ctx.sampleRate * dur);
    const fireBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const fData = fireBuf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < sampleCount; i++) {
      const w = Math.random() * 2 - 1;
      brown = (brown + 0.04 * w) / 1.04;
      const crackle = Math.random() > 0.992 ? (Math.random() * 2 - 1) * 1.4 : 0;
      fData[i] = brown * 4.5 + w * 0.35 + crackle;
    }
    const fireSrc = ctx.createBufferSource();
    fireSrc.buffer = fireBuf;

    // Sweeping flame filter: ignition woosh -> blazing high-heat roar -> ember tail
    const fireBand = ctx.createBiquadFilter();
    fireBand.type = 'bandpass';
    fireBand.Q.setValueAtTime(1.15, now);
    fireBand.frequency.setValueAtTime(240, now + 0.05);
    fireBand.frequency.exponentialRampToValueAtTime(1250, now + 0.32);
    fireBand.frequency.exponentialRampToValueAtTime(620, now + 1.15);
    fireBand.frequency.exponentialRampToValueAtTime(260, now + dur);

    const fireLow = ctx.createBiquadFilter();
    fireLow.type = 'lowpass';
    fireLow.frequency.setValueAtTime(420, now);

    const fireGain = ctx.createGain();
    fireGain.gain.setValueAtTime(0.001, now);
    fireGain.gain.linearRampToValueAtTime(0.95, now + 0.22);
    fireGain.gain.setValueAtTime(0.88, now + 1.1);
    fireGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    fireSrc.connect(fireBand);
    fireSrc.connect(fireLow);
    fireBand.connect(fireGain);
    fireLow.connect(fireGain);
    fireGain.connect(compressor);

    bellow.start(now);
    bellowSub.start(now);
    fireSrc.start(now + 0.04);

    const stopAt = now + dur + 0.05;
    bellow.stop(stopAt);
    bellowSub.stop(stopAt);
    fireSrc.stop(stopAt);
  }

  public playDragonWin(announceVoice = true) {
    // Fierce Dragon bellow + roaring fire breath jet + royal sapphire brass chord
    this.playDragonFireRoar();
    const fanfare = [392.0, 493.88, 587.33, 783.99];
    fanfare.forEach((n, idx) => {
      this.playTone(n, n, 0.38, 'triangle', 0.16, 0.45 + idx * 0.065);
    });
    if (announceVoice) {
      window.setTimeout(() => this.speakCallout('Dragon wins'), 620);
    }
  }

  public playTigerWin(announceVoice = true) {
    // Loud realistic Bengal Tiger roar + triumphant golden brass fanfare
    this.playTigerRoar();
    const fanfare = [440.0, 554.37, 659.25, 880.0];
    fanfare.forEach((n, idx) => {
      this.playTone(n, n, 0.38, 'triangle', 0.16, 0.58 + idx * 0.065);
    });
    if (announceVoice) {
      window.setTimeout(() => this.speakCallout('Tiger wins'), 780);
    }
  }

  public playTieJackpot(announceVoice = true) {
    // Sparkling 8:1 Tie jackpot arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.01, 0.28, 'sine', 0.19, idx * 0.055);
    });
    if (announceVoice) {
      this.speakCallout('Tie');
    }
  }

  public playCoinShower() {
    // Sparkling casino coin payout cascade
    for (let i = 0; i < 8; i++) {
      const delay = i * 0.055;
      const base = 1350 + (i % 4) * 260 + Math.random() * 140;
      this.playTone(base, base * 1.18, 0.11, 'sine', 0.15, delay);
      this.playTone(base * 1.5, base * 1.4, 0.07, 'triangle', 0.08, delay + 0.015);
    }
  }

  public playDiceRoll() {
    for (let i = 0; i < 6; i++) {
      const delay = i * 0.065;
      this.playTone(320 + Math.random() * 260, 180, 0.04, 'square', 0.07, delay);
      this.playNoise(0.045, 1600 + Math.random() * 800, 0.14, delay);
    }
  }

  public playTokenHop() {
    this.playTone(440, 660, 0.085, 'sine', 0.16);
  }

  public playTokenCapture() {
    this.playTone(540, 160, 0.22, 'sawtooth', 0.18);
    this.playNoise(0.16, 900, 0.2, 0.02);
  }

  public playCoinReward() {
    const notes = [880, 1108.73, 1318.51, 1760];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.01, 0.2, 'sine', 0.16, idx * 0.065);
    });
  }

  public playWinFanfare() {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((n, idx) => {
      this.playTone(n, n, 0.42, 'triangle', 0.18, idx * 0.07);
    });
  }

  public playLoseTone() {
    this.playTone(320, 175, 0.34, 'triangle', 0.16);
  }

  public playCrashBoom() {
    this.playTone(135, 34, 0.55, 'sawtooth', 0.28);
    this.playNoise(0.6, 380, 0.36);
  }

  public startEngine() {
    if (!this.soundEnabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.stopEngine();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92, now);
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(46, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(360, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.volume * 0.075, now + 0.35);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    sub.start(now);

    this.engineOsc = osc;
    this.engineSubOsc = sub;
    this.engineFilter = filter;
    this.engineGain = gain;
  }

  public updateEnginePitch(multiplier: number) {
    if (!this.ctx || !this.engineOsc || !this.engineSubOsc || !this.engineFilter) return;
    const clamped = Math.min(12, Math.max(1, multiplier));
    const baseFreq = 92 + (clamped - 1) * 18;
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.08);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(360 + (clamped - 1) * 110, now, 0.08);
  }

  public stopEngine() {
    if (this.engineGain && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        this.engineGain.gain.setTargetAtTime(0.0001, now, 0.05);
      } catch {
        // ignore audio teardown race
      }
    }
    const o1 = this.engineOsc;
    const o2 = this.engineSubOsc;
    this.engineOsc = null;
    this.engineSubOsc = null;
    this.engineFilter = null;
    this.engineGain = null;
    window.setTimeout(() => {
      try {
        o1?.stop();
        o2?.stop();
      } catch {
        // already stopped
      }
    }, 120);
  }

  private startAmbientMusic() {
    const ctx = this.ensureContext();
    if (!ctx || this.musicOscs.length > 0) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.volume * 0.055, now + 1.2);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Subtle luxury obsidian D-minor 9th drone pad
    const freqs = [73.42, 110.0, 130.81, 164.81];
    this.musicOscs = freqs.map((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.connect(filter);
      osc.start(now);
      return osc;
    });
    this.musicGain = gain;
  }

  private stopAmbientMusic() {
    if (this.musicGain && this.ctx) {
      try {
        this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
      } catch {
        // ignore
      }
    }
    const oscs = this.musicOscs;
    this.musicOscs = [];
    this.musicGain = null;
    window.setTimeout(() => {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          // ignore
        }
      });
    }, 250);
  }
}

export const soundEngine = new SoundEngine();
