import * as THREE from 'three';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 480;
const VIEW_H = 360;
const PX_PER_DEG = 6;

const COLOR_BRIGHT = 'rgba(255, 255, 255, 0.92)';
const COLOR_DIM = 'rgba(255, 255, 255, 0.55)';

const TEXT_UPDATE_MS = 100;

// Load-factor smoothing time constant (seconds) — filters the raw finite-difference
// acceleration; the physics loop runs at 60 Hz and one-frame Δv is noisy.
const G_SMOOTH_TAU = 0.15;
const G_WORLD = 9.81;

const FPM_CLAMP_X = 170;
const FPM_CLAMP_Y = 110;

const RIGHT_LOCAL = new THREE.Vector3(1, 0, 0);
const UP_LOCAL = new THREE.Vector3(0, 1, 0);
const FORWARD_LOCAL = new THREE.Vector3(0, 0, -1);

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function svgLine(x1, y1, x2, y2, stroke, width, dashed) {
  const el = svg('line', {
    x1, y1, x2, y2,
    stroke,
    'stroke-width': width,
    'stroke-linecap': 'round',
  });
  if (dashed) el.setAttribute('stroke-dasharray', '3 4');
  return el;
}

function svgText(x, y, str, size, opts = {}) {
  const el = svg('text', {
    x, y,
    fill: opts.fill || COLOR_BRIGHT,
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    'font-size': size,
    'text-anchor': opts.anchor || 'middle',
  });
  if (opts.weight) el.setAttribute('font-weight', opts.weight);
  el.textContent = str;
  return el;
}

export function createFlightHud({ getPose, getMode }) {
  const root = document.createElement('div');
  root.id = 'flight-hud';
  Object.assign(root.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    width: `${VIEW_W}px`,
    height: `${VIEW_H}px`,
    marginLeft: `${-VIEW_W / 2}px`,
    marginTop: `${-VIEW_H / 2}px`,
    pointerEvents: 'none',
    display: 'none',
    zIndex: '5',
  });

  const root_svg = svg('svg', {
    viewBox: `${-VIEW_W / 2} ${-VIEW_H / 2} ${VIEW_W} ${VIEW_H}`,
    width: '100%',
    height: '100%',
  });
  root_svg.style.overflow = 'visible';
  root.appendChild(root_svg);

  const bankTicks = svg('g', { stroke: COLOR_DIM, 'stroke-width': '1', fill: 'none' });
  const bankRadius = 130;
  const bankMarks = [
    { angle: -60, len: 6 },
    { angle: -45, len: 8 },
    { angle: -30, len: 6 },
    { angle: -15, len: 4 },
    { angle: 0, len: 10 },
    { angle: 15, len: 4 },
    { angle: 30, len: 6 },
    { angle: 45, len: 8 },
    { angle: 60, len: 6 },
  ];
  for (const m of bankMarks) {
    const rad = ((m.angle - 90) * Math.PI) / 180;
    const x1 = Math.cos(rad) * bankRadius;
    const y1 = Math.sin(rad) * bankRadius;
    const x2 = Math.cos(rad) * (bankRadius + m.len);
    const y2 = Math.sin(rad) * (bankRadius + m.len);
    bankTicks.appendChild(svgLine(x1, y1, x2, y2, COLOR_DIM, m.angle === 0 ? 1.4 : 1));
  }
  root_svg.appendChild(bankTicks);

  const bankPointerFixed = svg('polygon', {
    points: '0,-116 -4,-108 4,-108',
    fill: COLOR_BRIGHT,
  });
  root_svg.appendChild(bankPointerFixed);

  const bankPointerRot = svg('polygon', {
    points: '0,-104 -4,-96 4,-96',
    fill: 'none',
    stroke: COLOR_DIM,
    'stroke-width': '1',
  });
  root_svg.appendChild(bankPointerRot);

  const ladderGroup = svg('g');
  root_svg.appendChild(ladderGroup);

  ladderGroup.appendChild(svgLine(-180, 0, -30, 0, COLOR_BRIGHT, 1.4));
  ladderGroup.appendChild(svgLine(30, 0, 180, 0, COLOR_BRIGHT, 1.4));

  const rungs = [10, 20, 30, 45, 60];
  for (const p of rungs) {
    const halfLen = 30 + (p >= 30 ? 20 : 10);
    // positive pitch (above horizon) — solid
    const y = -p * PX_PER_DEG;
    ladderGroup.appendChild(svgLine(-halfLen - 30, y, -30, y, COLOR_DIM, 1));
    ladderGroup.appendChild(svgLine(30, y, halfLen + 30, y, COLOR_DIM, 1));
    ladderGroup.appendChild(svgText(-halfLen - 42, y + 3, String(p), 11, { fill: COLOR_DIM }));
    ladderGroup.appendChild(svgText(halfLen + 42, y + 3, String(p), 11, { fill: COLOR_DIM }));
    // negative pitch (below horizon) — dashed
    const yn = p * PX_PER_DEG;
    ladderGroup.appendChild(svgLine(-halfLen - 30, yn, -30, yn, COLOR_DIM, 1, true));
    ladderGroup.appendChild(svgLine(30, yn, halfLen + 30, yn, COLOR_DIM, 1, true));
    ladderGroup.appendChild(svgText(-halfLen - 42, yn + 3, String(p), 11, { fill: COLOR_DIM }));
    ladderGroup.appendChild(svgText(halfLen + 42, yn + 3, String(p), 11, { fill: COLOR_DIM }));
  }

  const noseGroup = svg('g');
  noseGroup.appendChild(svg('circle', { cx: 0, cy: 0, r: 2, fill: COLOR_BRIGHT }));
  noseGroup.appendChild(svgLine(-14, 0, -6, 0, COLOR_BRIGHT, 1.4));
  noseGroup.appendChild(svgLine(6, 0, 14, 0, COLOR_BRIGHT, 1.4));
  root_svg.appendChild(noseGroup);

  const fpmGroup = svg('g');
  fpmGroup.appendChild(svg('circle', {
    cx: 0, cy: 0, r: 5,
    fill: 'none',
    stroke: COLOR_BRIGHT,
    'stroke-width': 1.4,
  }));
  root_svg.appendChild(fpmGroup);

  const speedNum = svgText(-190, 4, '0', 20, { weight: '600' });
  root_svg.appendChild(speedNum);
  root_svg.appendChild(svgText(-190, -16, 'm/s', 11, { fill: COLOR_DIM }));

  const altNum = svgText(190, 4, '0', 20, { weight: '600' });
  root_svg.appendChild(altNum);
  root_svg.appendChild(svgText(190, -16, 'M', 11, { fill: COLOR_DIM }));

  const hdgLabel = svgText(0, -140, '000°', 12);
  root_svg.appendChild(hdgLabel);

  const gLabel = svgText(-190, 150, 'G 1.0', 11, { fill: COLOR_DIM });
  root_svg.appendChild(gLabel);
  const thrLabel = svgText(190, 150, 'THR --', 11, { fill: COLOR_DIM });
  root_svg.appendChild(thrLabel);

  const noseVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const upVec = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  const vLocal = new THREE.Vector3();
  const prevVelocity = new THREE.Vector3();
  const accelWorld = new THREE.Vector3();
  const gravityVec = new THREE.Vector3(0, G_WORLD, 0);
  let smoothedG = 1;
  let prevVelocityInit = false;

  let mounted = false;
  let textLastMs = 0;

  function update(dt) {
    const mode = getMode ? getMode() : 'airplane';
    if (mode !== 'airplane') {
      if (root.style.display !== 'none') root.style.display = 'none';
      prevVelocityInit = false;
      return;
    }
    if (root.style.display !== 'block') root.style.display = 'block';

    const pose = getPose();
    if (!pose) return;
    const { quaternion, velocity, position, throttle } = pose;

    noseVec.copy(FORWARD_LOCAL).applyQuaternion(quaternion);
    rightVec.copy(RIGHT_LOCAL).applyQuaternion(quaternion);
    upVec.copy(UP_LOCAL).applyQuaternion(quaternion);

    const pitchRad = Math.asin(Math.max(-1, Math.min(1, noseVec.y)));
    const pitchDeg = (pitchRad * 180) / Math.PI;

    const bankDeg = (-Math.atan2(rightVec.y, upVec.y) * 180) / Math.PI;

    let hdgDeg = (Math.atan2(noseVec.x, -noseVec.z) * 180) / Math.PI;
    if (hdgDeg < 0) hdgDeg += 360;

    // SVG transform applies right-to-left: translate first (shift ladder along the
    // rotated screen-vertical by pitch pixels), then rotate by -bank so the horizon
    // tilts opposite to the plane's roll.
    ladderGroup.setAttribute(
      'transform',
      `rotate(${(-bankDeg).toFixed(2)}) translate(0 ${(pitchDeg * PX_PER_DEG).toFixed(1)})`,
    );
    bankPointerRot.setAttribute('transform', `rotate(${(-bankDeg).toFixed(2)})`);

    invQ.copy(quaternion).invert();
    vLocal.copy(velocity).applyQuaternion(invQ);
    const speed = velocity.length();
    if (speed < 0.5 || vLocal.z >= 0) {
      fpmGroup.setAttribute('transform', 'translate(0 0)');
    } else {
      const forwardMag = -vLocal.z;
      const horizAng = Math.atan2(vLocal.x, forwardMag);
      const vertAng = Math.atan2(vLocal.y, Math.hypot(vLocal.x, forwardMag));
      let fx = ((horizAng * 180) / Math.PI) * PX_PER_DEG;
      let fy = ((-vertAng * 180) / Math.PI) * PX_PER_DEG;
      fx = Math.max(-FPM_CLAMP_X, Math.min(FPM_CLAMP_X, fx));
      fy = Math.max(-FPM_CLAMP_Y, Math.min(FPM_CLAMP_Y, fy));
      fpmGroup.setAttribute('transform', `translate(${fx.toFixed(1)} ${fy.toFixed(1)})`);
    }

    if (prevVelocityInit && dt > 0) {
      accelWorld.copy(velocity).sub(prevVelocity).multiplyScalar(1 / dt);
      accelWorld.add(gravityVec);
      const gInst = accelWorld.length() / G_WORLD;
      const alpha = Math.min(1, dt / G_SMOOTH_TAU);
      smoothedG = smoothedG * (1 - alpha) + gInst * alpha;
    }
    prevVelocity.copy(velocity);
    prevVelocityInit = true;

    const nowMs = performance.now();
    if (nowMs - textLastMs > TEXT_UPDATE_MS) {
      textLastMs = nowMs;
      speedNum.textContent = String(Math.round(speed));
      altNum.textContent = String(Math.round(position.y));
      hdgLabel.textContent = `${String(Math.round(hdgDeg)).padStart(3, '0')}°`;
      gLabel.textContent = `G ${smoothedG.toFixed(1)}`;
      thrLabel.textContent = throttle != null ? `THR ${Math.round(throttle * 100)}%` : 'THR --';
    }
  }

  function mount(parent) {
    if (mounted) return;
    parent.appendChild(root);
    mounted = true;
  }

  function dispose() {
    if (mounted) {
      root.remove();
      mounted = false;
    }
  }

  return { mount, update, dispose };
}
