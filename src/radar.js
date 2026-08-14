// Pure bearing/distance helper. World convention: -Z is north, +X is east.
// bearingDeg: 0 = north, 90 = east, 180 = south, 270 = west (clockwise, y ignored).
export function computeRadar({ from, to }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distanceM = Math.hypot(dx, dz);
  const bearingRad = Math.atan2(dx, -dz);
  const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;
  return { bearingRad, bearingDeg, distanceM, dx, dz };
}

const REARM_MULTIPLIER = 1.5;
const TOAST_DURATION_S = 5;
const TOAST_TEXT = 'You found the mailbox!';

export function createRadar({
  hudRoot,
  getPlanePosition,
  getMailboxPosition,
  foundThresholdM = 30,
}) {
  const rearmDistanceM = foundThresholdM * REARM_MULTIPLIER;
  let box = null;
  let arrow = null;
  let dist = null;
  let armed = true;
  let toastRemainingS = 0;

  function ensureDom() {
    if (box) return;
    box = hudRoot.querySelector('#radar');
    if (!box) return;
    arrow = box.querySelector('.arrow');
    dist = box.querySelector('.dist');
  }

  function update(dt) {
    ensureDom();
    if (!box) return;

    const from = getPlanePosition();
    const to = getMailboxPosition();
    if (!from || !to) return;

    const { bearingDeg, distanceM } = computeRadar({ from, to });

    if (arrow) arrow.style.transform = `rotate(${bearingDeg.toFixed(1)}deg)`;

    if (armed && distanceM <= foundThresholdM) {
      armed = false;
      toastRemainingS = TOAST_DURATION_S;
      if (box.classList) box.classList.add('found');
    } else if (!armed && distanceM > rearmDistanceM) {
      armed = true;
    }

    if (toastRemainingS > 0) {
      toastRemainingS -= dt;
      if (dist) dist.textContent = TOAST_TEXT;
      if (toastRemainingS <= 0) {
        toastRemainingS = 0;
        if (box.classList) box.classList.remove('found');
      }
    } else if (dist) {
      dist.textContent = `${Math.round(distanceM)} m`;
    }
  }

  return { update };
}
