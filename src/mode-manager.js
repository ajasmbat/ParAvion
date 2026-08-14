import * as THREE from 'three';
import { createGuns } from './guns.js';

const CHASE_OFFSET_LOCAL = new THREE.Vector3(0, 5, 15);
const LOOK_AHEAD = 20;
const CHASE_LERP_PER_60HZ_FRAME = 0.12;
const SPAWN_FORWARD_OFFSET = 30;

export function createModeManager({ scene, camera, domElement, airplane, flycam, collision }) {
  let mode = 'flycam';
  const keys = new Set();
  const mouseButtons = new Set();
  let mouseDX = 0;
  let mouseDY = 0;

  const isLocked = () => document.pointerLockElement === domElement;
  const guns = createGuns(scene, airplane, camera);

  const onKeyDown = (event) => {
    if (event.code === 'KeyC') {
      event.preventDefault();
      toggle();
      return;
    }
    if (mode !== 'airplane') return;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'Space') {
      event.preventDefault();
    }
    keys.add(event.code);
  };

  const onKeyUp = (event) => {
    if (mode !== 'airplane') return;
    keys.delete(event.code);
  };

  const onMouseMove = (event) => {
    if (mode !== 'airplane') return;
    if (!isLocked()) return;
    mouseDX += event.movementX;
    mouseDY += event.movementY;
  };

  const onPointerLockChange = () => {
    if (!isLocked()) {
      keys.clear();
      mouseButtons.clear();
      mouseDX = 0;
      mouseDY = 0;
    }
  };

  const onMouseDown = (event) => {
    if (mode !== 'airplane') return;
    if (!isLocked()) return;
    mouseButtons.add(event.button);
  };

  const onMouseUp = (event) => {
    mouseButtons.delete(event.button);
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  const chaseOffsetWorld = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const noseTmp = new THREE.Vector3();
  const spawnForward = new THREE.Vector3();

  function toggle() {
    setMode(mode === 'flycam' ? 'airplane' : 'flycam');
  }

  function setMode(next) {
    if (next === mode) return;
    if (next === 'airplane') {
      if (airplane.isCrashed && airplane.isCrashed()) airplane.respawn();
      const camPose = flycam.getPose();
      spawnForward.set(0, 0, -SPAWN_FORWARD_OFFSET).applyQuaternion(camPose.quaternion);
      const spawnPos = camPose.position.clone().add(spawnForward);
      airplane.setPose(spawnPos, camPose.quaternion.clone());
      airplane.setVisible(true);
      flycam.setActive(false);
      guns.setActive(true);
    } else {
      const planePose = airplane.getPose();
      flycam.setPose(planePose.position.clone(), planePose.quaternion.clone());
      flycam.setActive(true);
      airplane.setVisible(false);
      guns.setActive(false);
    }
    keys.clear();
    mouseButtons.clear();
    mouseDX = 0;
    mouseDY = 0;
    mode = next;
  }

  flycam.setActive(true);
  airplane.setVisible(false);
  guns.setActive(false);

  return {
    update(dt) {
      if (mode === 'flycam') {
        flycam.update(dt);
        guns.update(dt, { fire: false });
        return;
      }

      const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      airplane.update(dt, { keys, mouseDX, mouseDY, boost }, collision);
      mouseDX = 0;
      mouseDY = 0;

      const pose = airplane.getPose();
      chaseOffsetWorld.copy(CHASE_OFFSET_LOCAL).applyQuaternion(pose.quaternion);
      camDesired.copy(pose.position).add(chaseOffsetWorld);
      const alpha = Math.min(1, CHASE_LERP_PER_60HZ_FRAME * (dt * 60));
      camera.position.lerp(camDesired, alpha);
      noseTmp.set(0, 0, -1).applyQuaternion(pose.quaternion);
      lookTarget.copy(pose.position).addScaledVector(noseTmp, LOOK_AHEAD);
      camera.lookAt(lookTarget);

      const fire = keys.has('Space') || (mouseButtons.has(0) && isLocked());
      guns.update(dt, { fire });
    },

    setMode,
    getMode: () => mode,
    getSpeed: () => (mode === 'airplane' ? airplane.getSpeed() : 0),

    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      guns.dispose();
    },
  };
}
