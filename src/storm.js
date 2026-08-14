import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const ENTER_ALT = 200;
const EXIT_ALT = 190;
const STRIKE_MIN = 2;
const STRIKE_MAX = 8;
const FLASH_PEAK = 8;
const FLICKER_COUNT_MIN = 2;
const FLICKER_COUNT_MAX = 4;
const FLICKER_TOTAL_MS_MIN = 250;
const FLICKER_TOTAL_MS_MAX = 400;
const FILL_RATIO = 0.18;
const STORM_SEED = 0xa11ce;
const SAMPLE_URL = '/audio/lightning.mp3';

export function createStorm(scene, camera, options = {}) {
  const seed = options.seed ?? STORM_SEED;
  const rand = mulberry32(seed);

  const handlers = { stormEnter: [], stormExit: [], strike: [] };
  const emit = (event, payload) => {
    const list = handlers[event];
    if (!list) return;
    for (const fn of list) fn(payload);
  };

  const flashLight = new THREE.DirectionalLight(0xffffff, 0);
  flashLight.position.set(0, 500, 0);
  flashLight.target.position.set(0, 0, 0);
  scene.add(flashLight);
  scene.add(flashLight.target);

  // Omnidirectional fill so the flicker registers regardless of where the
  // camera is looking — the directional beam alone misses side/back angles.
  const fillLight = new THREE.HemisphereLight(0xbfd4ff, 0x202030, 0);
  scene.add(fillLight);

  let inZone = false;
  let timeToNextStrike = 0;
  let muted = false;
  let disposed = false;

  let strikeMin = STRIKE_MIN;
  let strikeMax = STRIKE_MAX;

  const pendingTimers = new Set();
  const pendingSources = new Set();
  const pendingFlickers = new Set();

  let audioCtx = null;
  let sampleBuffer = null;
  let sampleLoading = null;

  const loadSample = () => {
    if (sampleBuffer || sampleLoading || !audioCtx) return;
    const ctx = audioCtx;
    sampleLoading = fetch(SAMPLE_URL)
      .then((r) => r.arrayBuffer())
      .then((buf) => new Promise((resolve, reject) => ctx.decodeAudioData(buf, resolve, reject)))
      .then((decoded) => { sampleBuffer = decoded; })
      .catch(() => {})
      .finally(() => { sampleLoading = null; });
  };

  const armAudio = () => {
    if (audioCtx || disposed) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    audioCtx.resume().catch(() => {});
    loadSample();
  };
  const onFirstGesture = () => armAudio();
  window.addEventListener('pointerdown', onFirstGesture);
  window.addEventListener('keydown', onFirstGesture);

  const scheduleNextStrike = () => {
    timeToNextStrike = strikeMin + rand() * (strikeMax - strikeMin);
  };

  const playSample = (gain = 1, when = 0) => {
    if (muted || !audioCtx || !sampleBuffer) return null;
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = sampleBuffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + when);
    pendingSources.add(src);
    src.onended = () => {
      pendingSources.delete(src);
      try { src.disconnect(); g.disconnect(); } catch (_) {}
    };
    return src;
  };

  const setFlashIntensity = (v) => {
    flashLight.intensity = v;
    fillLight.intensity = v * FILL_RATIO;
  };

  const fireStrike = () => {
    const flickerN = FLICKER_COUNT_MIN + Math.floor(rand() * (FLICKER_COUNT_MAX - FLICKER_COUNT_MIN + 1));
    const totalMs = FLICKER_TOTAL_MS_MIN + rand() * (FLICKER_TOTAL_MS_MAX - FLICKER_TOTAL_MS_MIN);
    const slotMs = totalMs / flickerN;

    for (let i = 0; i < flickerN; i++) {
      const jitter = rand() * slotMs * 0.2;
      const onAt = i * slotMs + jitter;
      const onDur = slotMs * (0.3 + rand() * 0.35);
      const peak = FLASH_PEAK * (0.55 + rand() * 0.45);

      const onHandle = setTimeout(() => {
        pendingFlickers.delete(onHandle);
        if (disposed) return;
        setFlashIntensity(peak);
      }, onAt);
      pendingFlickers.add(onHandle);

      const offHandle = setTimeout(() => {
        pendingFlickers.delete(offHandle);
        if (disposed) return;
        setFlashIntensity(0);
      }, onAt + onDur);
      pendingFlickers.add(offHandle);
    }

    // Belt-and-suspenders: after the flicker window, force back to zero in case
    // a slot's off-timer got dropped somehow.
    const resetHandle = setTimeout(() => {
      pendingFlickers.delete(resetHandle);
      if (disposed) return;
      setFlashIntensity(0);
    }, totalMs + 20);
    pendingFlickers.add(resetHandle);

    // Play the mp3 once at strike onset. The sample already contains both the
    // crack and the rumble, so a second delayed playback would double-echo.
    // Kept the pendingTimers/pendingSources machinery so we can flip back to a
    // second delayed playback with one line if desired.
    playSample(1.0, 0);

    emit('strike', { intensity: FLASH_PEAK });
  };

  const cancelPending = () => {
    for (const h of pendingTimers) clearTimeout(h);
    pendingTimers.clear();
    for (const src of pendingSources) {
      try { src.stop(); } catch (_) {}
      try { src.disconnect(); } catch (_) {}
    }
    pendingSources.clear();
    for (const h of pendingFlickers) clearTimeout(h);
    pendingFlickers.clear();
    setFlashIntensity(0);
  };

  const enter = () => {
    inZone = true;
    scheduleNextStrike();
    emit('stormEnter');
  };

  const exit = () => {
    inZone = false;
    cancelPending();
    timeToNextStrike = 0;
    emit('stormExit');
  };

  return {
    update(dt) {
      const y = camera.position.y;
      if (!inZone && y > ENTER_ALT) enter();
      else if (inZone && y < EXIT_ALT) exit();

      if (inZone) {
        timeToNextStrike -= dt;
        if (timeToNextStrike <= 0) {
          fireStrike();
          scheduleNextStrike();
        }
      }
    },
    on(event, handler) {
      if (handlers[event]) handlers[event].push(handler);
    },
    setMuted(value) {
      muted = !!value;
    },
    isMuted() {
      return muted;
    },
    isInZone() {
      return inZone;
    },
    setStrikeRate(min, max) {
      strikeMin = Math.max(0.2, min);
      strikeMax = Math.max(strikeMin + 0.1, max);
    },
    getStrikeRate() {
      return { min: strikeMin, max: strikeMax };
    },
    dispose() {
      disposed = true;
      cancelPending();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      scene.remove(flashLight);
      scene.remove(flashLight.target);
      scene.remove(fillLight);
      flashLight.dispose?.();
      fillLight.dispose?.();
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    },
  };
}
