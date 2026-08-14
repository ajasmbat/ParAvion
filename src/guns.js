import * as THREE from 'three';

const BULLET_MAX = 200;
const BULLET_SPEED = 500;
const BULLET_TTL = 1.0;
const BULLET_MAX_DIST = 800;
const FIRE_INTERVAL = 1 / 10;
const MUZZLE_FLASH_DECAY = 0.06;

const GUN_LEFT_LOCAL = new THREE.Vector3(-0.6, 0.1, -3.2);
const GUN_RIGHT_LOCAL = new THREE.Vector3(0.6, 0.1, -3.2);

const BULLET_GEOMETRY = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
const BULLET_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
const FLASH_GEOMETRY = new THREE.PlaneGeometry(1.2, 1.2);
const FLASH_MATERIAL_TEMPLATE = {
  color: 0xffe08a,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
};
const CYLINDER_UP = new THREE.Vector3(0, 1, 0);

export function createGuns(scene, airplane, camera) {
  const bullets = new Array(BULLET_MAX);
  for (let i = 0; i < BULLET_MAX; i++) {
    const mesh = new THREE.Mesh(BULLET_GEOMETRY, BULLET_MATERIAL);
    mesh.renderOrder = 2;
    mesh.visible = false;
    scene.add(mesh);
    bullets[i] = {
      mesh,
      velocity: new THREE.Vector3(),
      ttl: 0,
      dist: 0,
      active: false,
    };
  }
  let nextBulletIdx = 0;

  const flashLeftMaterial = new THREE.MeshBasicMaterial(FLASH_MATERIAL_TEMPLATE);
  const flashRightMaterial = new THREE.MeshBasicMaterial(FLASH_MATERIAL_TEMPLATE);
  const flashLeft = new THREE.Mesh(FLASH_GEOMETRY, flashLeftMaterial);
  const flashRight = new THREE.Mesh(FLASH_GEOMETRY, flashRightMaterial);
  flashLeft.position.copy(GUN_LEFT_LOCAL);
  flashRight.position.copy(GUN_RIGHT_LOCAL);
  flashLeft.renderOrder = 3;
  flashRight.renderOrder = 3;
  flashLeft.visible = false;
  flashRight.visible = false;
  airplane.mesh.add(flashLeft);
  airplane.mesh.add(flashRight);

  let active = false;
  let fireTimer = 0;

  const worldPosTmp = new THREE.Vector3();
  const worldVelTmp = new THREE.Vector3();
  const noseDirTmp = new THREE.Vector3();
  const bulletStepTmp = new THREE.Vector3();
  const bulletDirTmp = new THREE.Vector3();
  const cameraWorldPos = new THREE.Vector3();

  function spawnBullet(worldPos, worldVel) {
    let tries = 0;
    while (tries < BULLET_MAX) {
      const b = bullets[nextBulletIdx];
      nextBulletIdx = (nextBulletIdx + 1) % BULLET_MAX;
      if (!b.active) {
        b.active = true;
        b.ttl = BULLET_TTL;
        b.dist = 0;
        b.velocity.copy(worldVel);
        b.mesh.position.copy(worldPos);
        bulletDirTmp.copy(worldVel).normalize();
        b.mesh.quaternion.setFromUnitVectors(CYLINDER_UP, bulletDirTmp);
        b.mesh.visible = true;
        return;
      }
      tries++;
    }
  }

  function billboardFlash(flash) {
    camera.getWorldPosition(cameraWorldPos);
    flash.lookAt(cameraWorldPos);
  }

  return {
    update(dt, input) {
      for (let i = 0; i < BULLET_MAX; i++) {
        const b = bullets[i];
        if (!b.active) continue;
        bulletStepTmp.copy(b.velocity).multiplyScalar(dt);
        b.mesh.position.add(bulletStepTmp);
        b.dist += bulletStepTmp.length();
        b.ttl -= dt;
        if (b.ttl <= 0 || b.dist >= BULLET_MAX_DIST) {
          b.active = false;
          b.mesh.visible = false;
        }
      }

      if (flashLeftMaterial.opacity > 0) {
        flashLeftMaterial.opacity = Math.max(0, flashLeftMaterial.opacity - dt / MUZZLE_FLASH_DECAY);
        if (flashLeftMaterial.opacity <= 0) flashLeft.visible = false;
      }
      if (flashRightMaterial.opacity > 0) {
        flashRightMaterial.opacity = Math.max(0, flashRightMaterial.opacity - dt / MUZZLE_FLASH_DECAY);
        if (flashRightMaterial.opacity <= 0) flashRight.visible = false;
      }

      if (!active) {
        fireTimer = 0;
        return;
      }

      if (flashLeft.visible) billboardFlash(flashLeft);
      if (flashRight.visible) billboardFlash(flashRight);

      if (fireTimer > 0) fireTimer -= dt;

      if (!input || !input.fire) return;

      if (fireTimer > 0) return;
      fireTimer += FIRE_INTERVAL;
      if (fireTimer < 0) fireTimer = 0;

      const pose = airplane.getPose();
      noseDirTmp.set(0, 0, -1).applyQuaternion(pose.quaternion);

      worldPosTmp.copy(GUN_LEFT_LOCAL).applyQuaternion(pose.quaternion).add(pose.position);
      worldVelTmp.copy(noseDirTmp).multiplyScalar(BULLET_SPEED).add(pose.velocity);
      spawnBullet(worldPosTmp, worldVelTmp);
      flashLeftMaterial.opacity = 1;
      flashLeft.visible = true;

      worldPosTmp.copy(GUN_RIGHT_LOCAL).applyQuaternion(pose.quaternion).add(pose.position);
      worldVelTmp.copy(noseDirTmp).multiplyScalar(BULLET_SPEED).add(pose.velocity);
      spawnBullet(worldPosTmp, worldVelTmp);
      flashRightMaterial.opacity = 1;
      flashRight.visible = true;
    },

    setActive(value) {
      active = !!value;
      if (!active) {
        fireTimer = 0;
        flashLeftMaterial.opacity = 0;
        flashRightMaterial.opacity = 0;
        flashLeft.visible = false;
        flashRight.visible = false;
        for (let i = 0; i < BULLET_MAX; i++) {
          const b = bullets[i];
          if (b.active) {
            b.active = false;
            b.mesh.visible = false;
          }
        }
      }
    },

    dispose() {
      for (let i = 0; i < BULLET_MAX; i++) {
        scene.remove(bullets[i].mesh);
      }
      airplane.mesh.remove(flashLeft);
      airplane.mesh.remove(flashRight);
      flashLeftMaterial.dispose();
      flashRightMaterial.dispose();
    },
  };
}
