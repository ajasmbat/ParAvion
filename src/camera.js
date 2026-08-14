import * as THREE from 'three';

const MOUSE_SENSITIVITY = 0.002;
const BASE_SPEED = 60;
const BOOST_SPEED = 250;
const PITCH_LIMIT = THREE.MathUtils.degToRad(89);

export function createCameraController(camera, domElement) {
  const keys = new Set();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let initialised = false;

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

  const isLocked = () => document.pointerLockElement === domElement;

  const onClick = () => {
    if (!isLocked()) domElement.requestPointerLock();
  };

  const onMouseMove = (event) => {
    if (!isLocked()) return;
    euler.y -= event.movementX * MOUSE_SENSITIVITY;
    euler.x -= event.movementY * MOUSE_SENSITIVITY;
    if (euler.x > PITCH_LIMIT) euler.x = PITCH_LIMIT;
    if (euler.x < -PITCH_LIMIT) euler.x = -PITCH_LIMIT;
  };

  const onKeyDown = (event) => {
    if (event.code === 'Space' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
      event.preventDefault();
    }
    keys.add(event.code);
  };

  const onKeyUp = (event) => {
    keys.delete(event.code);
  };

  const onPointerLockChange = () => {
    if (!isLocked()) keys.clear();
  };

  domElement.addEventListener('click', onClick);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  return {
    update(dt) {
      if (!initialised) {
        euler.setFromQuaternion(camera.quaternion, 'YXZ');
        if (euler.x > PITCH_LIMIT) euler.x = PITCH_LIMIT;
        if (euler.x < -PITCH_LIMIT) euler.x = -PITCH_LIMIT;
        initialised = true;
      }

      camera.quaternion.setFromEuler(euler);

      if (!isLocked()) return;

      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? BOOST_SPEED : BASE_SPEED;
      const step = speed * dt;

      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      move.set(0, 0, 0);

      if (keys.has('KeyW')) move.addScaledVector(forward, 1);
      if (keys.has('KeyS')) move.addScaledVector(forward, -1);
      if (keys.has('KeyD')) move.addScaledVector(right, 1);
      if (keys.has('KeyA')) move.addScaledVector(right, -1);
      if (keys.has('Space')) move.y += 1;
      if (keys.has('ControlLeft') || keys.has('ControlRight')) move.y -= 1;

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(step);
        camera.position.add(move);
      }
    },

    dispose() {
      domElement.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      keys.clear();
    },
  };
}
