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

const DT = 1 / 120;

// Headless: no scene graph, and the GLB fetch rejects in Node — irrelevant to physics.
function makeAirplane() {
  const scene = { add() {}, remove() {} };
  const airplane = createAirplane(scene);
  airplane.ready.catch(() => {});
  return airplane;
}

function makeInput() {
  return { keys: new Set(), mouseDX: 0, mouseDY: 0, boost: false };
}

function run(airplane, input, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) airplane.update(DT, input);
}

function pitchOf(quaternion) {
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  return Math.asin(THREE.MathUtils.clamp(nose.y, -1, 1));
}

console.log('glide — throttle cut at cruise, small nose-down attitude → ratio ≥ 5:1');
{
  const airplane = makeAirplane();
  const input = makeInput();
  const pose = airplane.getPose();

  pose.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-3), 0, 0));
  pose.position.set(0, 2000, 0);
  pose.velocity.set(0, 0, -60);

  // Cut throttle the way a player would: hold S until it reaches 0 (~0.9 s),
  // then let the glide settle before measuring.
  input.keys.add('KeyS');
  run(airplane, input, 2);
  input.keys.delete('KeyS');

  const start = pose.position.clone();
  run(airplane, input, 5);

  const dy = start.y - pose.position.y;
  const horiz = Math.hypot(pose.position.x - start.x, pose.position.z - start.z);
  const ratio = horiz / Math.max(dy, 1e-6);
  console.log(`    glide: ${horiz.toFixed(0)} m forward, ${dy.toFixed(0)} m down, ratio ${ratio.toFixed(2)}:1`);
  assert(dy > 0, 'unpowered glide descends (not climbing for free)');
  assert(ratio >= 5, `glide ratio ${ratio.toFixed(2)}:1 is at least 5:1`);
  assert(airplane.getThrottle() === 0, 'throttle bled to 0');
}

console.log('stall — AoA past ~14° drops lift, nose falls through the horizon, recovery works');
{
  const airplane = makeAirplane();
  const input = makeInput();
  const pose = airplane.getPose();

  // Level cruise, then a sharp sustained pull-up: the zoom climb bleeds
  // airspeed until the wing lets go.
  pose.position.set(0, 2000, 0);
  pose.velocity.set(0, 0, -60);

  let minPitch = Infinity;
  let minSpeed = Infinity;
  let apex = 2000;
  const track = () => {
    minPitch = Math.min(minPitch, pitchOf(pose.quaternion));
    minSpeed = Math.min(minSpeed, airplane.getSpeed());
    apex = Math.max(apex, pose.position.y);
  };

  input.mouseDY = -0.8; // steady pitch-up to ~30° nose-high
  for (let i = 0; i < Math.round(4 / DT); i++) {
    airplane.update(DT, input);
    track();
  }
  input.mouseDY = 0; // hands off — watch the departure
  for (let i = 0; i < Math.round(8 / DT); i++) {
    airplane.update(DT, input);
    track();
  }
  console.log(`    over 8 s: min pitch ${THREE.MathUtils.radToDeg(minPitch).toFixed(1)}°, min speed ${minSpeed.toFixed(1)} m/s, apex +${(apex - 2000).toFixed(0)} m, end ${(pose.position.y - apex).toFixed(0)} m below apex`);
  assert(minPitch < 0, 'nose fell through the horizon');
  assert(pose.position.y < apex - 30, 'plane sinks after the stall bites');
  assert(minSpeed < 50, 'airspeed bled during the stall (60 → <50 m/s)');

  // Hands-off recovery: nose-low, the plane regains airspeed and flies again.
  run(airplane, input, 8);
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
  const velDir = pose.velocity.clone().normalize();
  const aoaAfter = nose.angleTo(velDir);
  console.log(`    after recovery: speed ${airplane.getSpeed().toFixed(1)} m/s, AoA ${THREE.MathUtils.radToDeg(aoaAfter).toFixed(1)}°`);
  assert(airplane.getSpeed() > 40, 'airspeed recovered after unstalling');
  assert(aoaAfter < THREE.MathUtils.degToRad(14), 'AoA back below the stall angle');
}

console.log('powered cruise — throttle 1.0, nose level → altitude within ±25 m over 10 s');
{
  const airplane = makeAirplane();
  const input = makeInput();
  const pose = airplane.getPose();

  // Ramp throttle 0.6 → 1.0 first (W held ~0.6 s), then pin the cruise state.
  input.keys.add('KeyW');
  run(airplane, input, 1);
  input.keys.delete('KeyW');
  assert(airplane.getThrottle() === 1, 'throttle ramped to 1.0');

  pose.quaternion.identity();
  pose.position.set(0, 1000, 0);
  pose.velocity.set(0, 0, -83);

  let minY = 1000;
  let maxY = 1000;
  const steps = Math.round(10 / DT);
  for (let i = 0; i < steps; i++) {
    airplane.update(DT, input);
    minY = Math.min(minY, pose.position.y);
    maxY = Math.max(maxY, pose.position.y);
  }
  console.log(`    altitude band over 10 s: ${(minY - 1000).toFixed(1)} m … +${(maxY - 1000).toFixed(1)} m`);
  assert(maxY - 1000 <= 25 && 1000 - minY <= 25, 'altitude held within ±25 m');
}

console.log('banked turn — 60° bank + pitch input still carves a horizontal turn');
{
  const airplane = makeAirplane();
  const input = makeInput();
  const pose = airplane.getPose();

  pose.quaternion.setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(60)));
  pose.position.set(0, 1000, 0);
  pose.velocity.set(0, 0, -70);

  const headingOf = () => {
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
    return Math.atan2(nose.x, -nose.z);
  };
  const startHeading = headingOf();

  // Steady back-pressure on the stick (mouse pitch-up) while banked.
  input.mouseDY = -2;
  run(airplane, input, 6);
  input.mouseDY = 0;

  let turned = THREE.MathUtils.radToDeg(Math.abs(headingOf() - startHeading));
  if (turned > 180) turned = 360 - turned;
  console.log(`    heading change ${turned.toFixed(0)}°, altitude ${pose.position.y.toFixed(0)} m`);
  assert(turned >= 45, 'heading changed by at least 45° in 6 s');
  assert(Math.abs(pose.position.y - 1000) < 200, 'turn stays roughly horizontal (no dive/zoom)');
}

console.log('sideslip — kicked sideways, the plane still self-aligns (weathervane intact)');
{
  const airplane = makeAirplane();
  const input = makeInput();
  const pose = airplane.getPose();

  pose.position.set(0, 1000, 0);
  pose.velocity.set(20, 0, -60); // forward cruise plus a 20 m/s sideways kick

  run(airplane, input, 5);

  const bodyRight = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
  const lateral = Math.abs(pose.velocity.dot(bodyRight));
  console.log(`    lateral speed after 5 s: ${lateral.toFixed(2)} m/s`);
  assert(lateral < 4, 'sideslip damped out, nose tracks the velocity vector');
}

if (process.exitCode) {
  console.error('\nglide.test.mjs: FAILURES');
} else {
  console.log('\nglide.test.mjs: all checks passed');
}
