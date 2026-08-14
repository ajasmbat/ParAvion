import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const ENTER_ALT = 200;
const EXIT_ALT = 190;
const STRIKE_MIN = 2;
const STRIKE_MAX = 8;
const THUNDER_MIN = 0.6;
const THUNDER_MAX = 2.5;
const FLASH_PEAK = 8;
const FLASH_DECAY = 0.22;
const STORM_SEED = 0xa11ce;

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

  let inZone = false;
  let timeToNextStrike = 0;
  let flashIntensity = 0;
  let muted = false;
  let disposed = false;

  const pendingThunder = new Set();

  let audioCtx = null;
  const armAudio = () => {
    if (audioCtx || disposed) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
  };
  const onFirstGesture = () => armAudio();
  window.addEventListener('pointerdown', onFirstGesture);
  window.addEventListener('keydown', onFirstGesture);

  const scheduleNextStrike = () => {
    timeToNextStrike = STRIKE_MIN + rand() * (STRIKE_MAX - STRIKE_MIN);
  };

  const playThunder = () => {
    if (muted || !audioCtx) return;
    const ctx = audioCtx;
    const dur = 1.2 + Math.random() * 1.2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 200 + Math.random() * 300;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.6, t0 + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(lpf).connect(gain).connect(ctx.destination);
    src.start();
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try { src.disconnect(); lpf.disconnect(); gain.disconnect(); } catch (_) {}
    };
  };

  const fireStrike = () => {
    flashIntensity = FLASH_PEAK;
    flashLight.intensity = FLASH_PEAK;
    const delay = THUNDER_MIN + rand() * (THUNDER_MAX - THUNDER_MIN);
    const handle = setTimeout(() => {
      pendingThunder.delete(handle);
      if (!inZone || disposed) return;
      playThunder();
    }, delay * 1000);
    pendingThunder.add(handle);
    emit('strike', { intensity: FLASH_PEAK });
  };

  const cancelPending = () => {
    for (const h of pendingThunder) clearTimeout(h);
    pendingThunder.clear();
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

      if (flashIntensity > 0) {
        flashIntensity = Math.max(0, flashIntensity - (FLASH_PEAK / FLASH_DECAY) * dt);
        flashLight.intensity = flashIntensity;
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
    dispose() {
      disposed = true;
      cancelPending();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      scene.remove(flashLight);
      scene.remove(flashLight.target);
      flashLight.dispose?.();
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    },
  };
}
