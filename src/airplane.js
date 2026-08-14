import * as THREE from 'three';

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

function createPaperAirplaneGeometry() {
  // Classic paper-airplane silhouette, nose pointing along local -Z.
  // Wingspan ~3m, length ~4m. Two flat wing triangles + a small vertical fin.
  const nose = [0, 0, -2];
  const wingL = [-1.6, 0, 1.6];
  const wingR = [1.6, 0, 1.6];
  const tail = [0, 0, 2];
  const finTop = [0, 0.35, 1.6];

  const positions = new Float32Array([
    ...nose, ...wingL, ...tail,
    ...nose, ...tail, ...wingR,
    ...nose, ...tail, ...finTop,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createAirplane(scene, options = {}) {
  const initialPose = options.initialPose ?? {
    position: new THREE.Vector3(0, 400, 0),
    quaternion: new THREE.Quaternion(),
  };

  const mesh = new THREE.Mesh(
    createPaperAirplaneGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.05,
    }),
  );
  mesh.position.copy(initialPose.position);
  mesh.quaternion.copy(initialPose.quaternion);
  mesh.visible = false;
  scene.add(mesh);

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
    mesh,

    update(dt, input) {
      const keys = input.keys;

      if (input.mouseDX || input.mouseDY) {
        rotDelta.setFromAxisAngle(pitchAxis, -input.mouseDY * MOUSE_SENSITIVITY);
        mesh.quaternion.multiply(rotDelta);
        rotDelta.setFromAxisAngle(yawAxis, -input.mouseDX * MOUSE_SENSITIVITY);
        mesh.quaternion.multiply(rotDelta);
      }

      if (keys.has('KeyA')) {
        rotDelta.setFromAxisAngle(rollAxis, ROLL_SPEED * dt);
        mesh.quaternion.multiply(rotDelta);
      }
      if (keys.has('KeyD')) {
        rotDelta.setFromAxisAngle(rollAxis, -ROLL_SPEED * dt);
        mesh.quaternion.multiply(rotDelta);
      }

      if (keys.has('KeyW')) throttle = Math.min(THROTTLE_MAX, throttle + THROTTLE_RAMP * dt);
      if (keys.has('KeyS')) throttle = Math.max(THROTTLE_MIN, throttle - THROTTLE_RAMP * dt);

      noseDir.set(0, 0, -1).applyQuaternion(mesh.quaternion);
      const thrustMag = (THRUST_BASE + (input.boost ? THRUST_BOOST_ADD : 0)) * throttle;
      thrustVec.copy(noseDir).multiplyScalar(thrustMag);

      const speed = velocity.length();
      dragVec.copy(velocity).multiplyScalar(-(DRAG_LINEAR + DRAG_QUADRATIC * speed));

      accel.set(0, -GRAVITY, 0).add(thrustVec).add(dragVec);
      velocity.addScaledVector(accel, dt);
      mesh.position.addScaledVector(velocity, dt);
    },

    getPose() {
      return { position: mesh.position, quaternion: mesh.quaternion, velocity };
    },

    setPose(position, quaternion) {
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      velocity.set(0, 0, 0);
    },

    setVisible(value) {
      mesh.visible = !!value;
    },

    getSpeed() {
      return velocity.length();
    },

    getThrottle() {
      return throttle;
    },

    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
