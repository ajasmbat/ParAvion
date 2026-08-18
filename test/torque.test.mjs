import * as THREE from 'three';
import { createAirplane } from '../src/airplane.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

const DT = 1 / 60;

function makeAirplane() {
  const scene = new THREE.Scene();
  const airplane = createAirplane(scene);
  airplane.ready.catch(() => {}); // no model file under node — physics only
  return airplane;
}

function input({ keys = [], mouseDX = 0, mouseDY = 0, boost = false } = {}) {
  return { keys: new Set(keys), mouseDX, mouseDY, boost };
}

function simulate(airplane, seconds, inp) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) airplane.update(DT, inp, null);
}

function bodyRight(airplane) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(airplane.getPose().quaternion);
}

function noseDir(airplane) {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(airplane.getPose().quaternion);
}

console.log('engine roll torque — hands-off full throttle rolls left');
{
  const a = makeAirplane();
  simulate(a, 1, input({ keys: ['KeyW'], boost: true })); // throttle 0.6 → 1.0
  simulate(a, 3, input({ boost: true })); // hands off, boost held
  // Left bank = right wing rises = body-right gains +Y.
  const bank = Math.asin(THREE.MathUtils.clamp(bodyRight(a).y, -1, 1));
  assert(bank > 0.15, `visible left bank within 3 s (bank ${(bank * 180 / Math.PI).toFixed(1)}°)`);
}

console.log('engine roll torque — dies with the throttle');
{
  const a = makeAirplane();
  simulate(a, 1, input({ keys: ['KeyS'] })); // throttle 0.6 → 0
  assert(a.getThrottle() === 0, 'throttle reached 0');
  const before = bodyRight(a).y;
  simulate(a, 2, input({}));
  const drift = Math.abs(bodyRight(a).y - before);
  assert(drift < 1e-3, `no self-roll at zero throttle (bank drift ${drift.toExponential(2)})`);
}

console.log('boost multiplies roll torque');
{
  const plain = makeAirplane();
  simulate(plain, 1, input({ keys: ['KeyW'] }));
  simulate(plain, 2, input({}));
  const boosted = makeAirplane();
  simulate(boosted, 1, input({ keys: ['KeyW'], boost: true }));
  simulate(boosted, 2, input({ boost: true }));
  assert(bodyRight(boosted).y > bodyRight(plain).y + 0.05, 'boost banks faster than dry throttle');
}

console.log('P-factor — nose-up powered flight yaws left');
{
  const a = makeAirplane();
  // Nose up 10°, standing start: thrust builds speed along the nose while
  // gravity drags the velocity below it → positive AoA from the first frames.
  const noseUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(10));
  a.setPose(new THREE.Vector3(0, 400, 0), noseUp);
  simulate(a, 0.6, input({ keys: ['KeyW'] })); // power up, no stick
  const nose = noseDir(a);
  // Started dead ahead (-Z); left yaw pushes the nose toward -X.
  assert(nose.x < -0.01, `nose drifted left of the flight path (nose.x ${nose.x.toFixed(4)})`);
  // And the flight-path marker ends up right of the nose: velocity right of nose heading.
  const { velocity } = a.getPose();
  const cross = new THREE.Vector3(nose.x, 0, nose.z).normalize()
    .cross(new THREE.Vector3(velocity.x, 0, velocity.z).normalize());
  assert(cross.y < 0, `velocity sits right of the nose (cross.y ${cross.y.toFixed(4)})`);
}

console.log('gyroscopic precession — sharp pitch-up at power yaws right');
{
  const a = makeAirplane();
  simulate(a, 1, input({ keys: ['KeyW'] })); // reach full throttle
  // Reset wings-level so torque-roll bank from the ramp-up doesn't contaminate nose.x.
  a.setPose(new THREE.Vector3(0, 400, 0), new THREE.Quaternion());
  simulate(a, 0.3, input({ mouseDY: -30 })); // hard pitch-up burst
  const nose = noseDir(a);
  assert(nose.x > 0.01, `pitch-up transient yaws the nose right (nose.x ${nose.x.toFixed(4)})`);
}

console.log('gyroscopic precession — no coupling with a dead engine');
{
  const a = makeAirplane();
  simulate(a, 1, input({ keys: ['KeyS'] })); // throttle to 0
  a.setPose(new THREE.Vector3(0, 400, 0), new THREE.Quaternion());
  simulate(a, 0.3, input({ mouseDY: -30 }));
  const nose = noseDir(a);
  assert(Math.abs(nose.x) < 1e-6, `pure pitch, no yaw at zero throttle (nose.x ${nose.x.toFixed(6)})`);
}

console.log('controllability — right roll input overpowers torque');
{
  const a = makeAirplane();
  simulate(a, 1, input({ keys: ['KeyW'], boost: true }));
  const before = bodyRight(a).y;
  simulate(a, 1, input({ keys: ['KeyD'], boost: true })); // pilot holds right roll
  assert(bodyRight(a).y < before, 'KeyD rolls right through full boost torque');
}

process.exit(process.exitCode ?? 0);
