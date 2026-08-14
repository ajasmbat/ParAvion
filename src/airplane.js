import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const GRAVITY = 6;
const THRUST_BASE = 30;
const THRUST_BOOST_ADD = 90;
const DRAG_LINEAR = 0.12;
const DRAG_QUADRATIC = 0.0022;
const MOUSE_SENSITIVITY = 0.0016;
const ROLL_SPEED = 1.6;
const THROTTLE_RAMP = 0.7;
const THROTTLE_MIN = 0;
const THROTTLE_MAX = 1;
const INITIAL_THROTTLE = 0.6;

const MODEL_URL = '/models/mustang.glb';
const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
const TARGET_WINGSPAN = 15;
// Meshy exports the Mustang facing local -X; the airplane's forward is -Z.
const MODEL_YAW_CORRECTION = -Math.PI / 2;

// Chosen material: Concept 1 — Polished Chrome (design gate 2026-08-14).
const MUSTANG_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xdadde6,
  metalness: 0.95,
  roughness: 0.18,
  envMapIntensity: 1.4,
});

let sharedLoader = null;
function getLoader() {
  if (sharedLoader) return sharedLoader;
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER);
  sharedLoader = new GLTFLoader().setDRACOLoader(draco);
  return sharedLoader;
}

export function createAirplane(scene, options = {}) {
  const initialPose = options.initialPose ?? {
    position: new THREE.Vector3(0, 400, 0),
    quaternion: new THREE.Quaternion(),
  };

  const plane = new THREE.Group();
  plane.position.copy(initialPose.position);
  plane.quaternion.copy(initialPose.quaternion);
  plane.visible = false;
  scene.add(plane);

  let modelRoot = null;
  const ready = new Promise((resolve, reject) => {
    getLoader().load(
      MODEL_URL,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.material?.dispose?.();
            o.material = MUSTANG_MATERIAL;
            o.castShadow = false;
            o.receiveShadow = false;
          }
        });

        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        const s = TARGET_WINGSPAN / Math.max(size.x, size.z);
        root.scale.setScalar(s);
        root.rotation.y = MODEL_YAW_CORRECTION;

        plane.add(root);
        modelRoot = root;
        resolve(root);
      },
      undefined,
      reject,
    );
  });

  const velocity = new THREE.Vector3();
  let throttle = INITIAL_THROTTLE;

  const noseDir = new THREE.Vector3();
  const thrustVec = new THREE.Vector3();
  const dragVec = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const rotDelta = new THREE.Quaternion();
  const pitchAxis = new THREE.Vector3(1, 0, 0);
  const yawAxis = new THREE.Vector3(0, 1, 0);
  const rollAxis = new THREE.Vector3(0, 0, 1);

  return {
    mesh: plane,
    ready,

    update(dt, input) {
      const keys = input.keys;

      if (input.mouseDX || input.mouseDY) {
        rotDelta.setFromAxisAngle(pitchAxis, -input.mouseDY * MOUSE_SENSITIVITY);
        plane.quaternion.multiply(rotDelta);
        rotDelta.setFromAxisAngle(yawAxis, -input.mouseDX * MOUSE_SENSITIVITY);
        plane.quaternion.multiply(rotDelta);
      }

      if (keys.has('KeyA')) {
        rotDelta.setFromAxisAngle(rollAxis, ROLL_SPEED * dt);
        plane.quaternion.multiply(rotDelta);
      }
      if (keys.has('KeyD')) {
        rotDelta.setFromAxisAngle(rollAxis, -ROLL_SPEED * dt);
        plane.quaternion.multiply(rotDelta);
      }

      if (keys.has('KeyW')) throttle = Math.min(THROTTLE_MAX, throttle + THROTTLE_RAMP * dt);
      if (keys.has('KeyS')) throttle = Math.max(THROTTLE_MIN, throttle - THROTTLE_RAMP * dt);

      noseDir.set(0, 0, -1).applyQuaternion(plane.quaternion);
      const thrustMag = (THRUST_BASE + (input.boost ? THRUST_BOOST_ADD : 0)) * throttle;
      thrustVec.copy(noseDir).multiplyScalar(thrustMag);

      const speed = velocity.length();
      dragVec.copy(velocity).multiplyScalar(-(DRAG_LINEAR + DRAG_QUADRATIC * speed));

      accel.set(0, -GRAVITY, 0).add(thrustVec).add(dragVec);
      velocity.addScaledVector(accel, dt);
      plane.position.addScaledVector(velocity, dt);
    },

    getPose() {
      return { position: plane.position, quaternion: plane.quaternion, velocity };
    },

    setPose(position, quaternion) {
      plane.position.copy(position);
      plane.quaternion.copy(quaternion);
      velocity.set(0, 0, 0);
    },

    setVisible(value) {
      plane.visible = !!value;
    },

    getSpeed() {
      return velocity.length();
    },

    getThrottle() {
      return throttle;
    },

    dispose() {
      scene.remove(plane);
      if (modelRoot) {
        modelRoot.traverse((o) => {
          if (o.isMesh) o.geometry?.dispose?.();
        });
      }
      MUSTANG_MATERIAL.dispose();
    },
  };
}
