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

const SPARK_MAX = 24;
const SPARK_TTL = 0.15;
const SPARK_GEOMETRY = new THREE.PlaneGeometry(1.6, 1.6);
const SPARK_MATERIAL_TEMPLATE = {
  color: 0xffc766,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
};

export function createGuns(scene, airplane, camera, collision) {
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

  // Impact sparks — pooled billboards that flare and shrink over SPARK_TTL.
  const sparks = new Array(SPARK_MAX);
  for (let i = 0; i < SPARK_MAX; i++) {
    const material = new THREE.MeshBasicMaterial(SPARK_MATERIAL_TEMPLATE);
    const mesh = new THREE.Mesh(SPARK_GEOMETRY, material);
    mesh.renderOrder = 3;
    mesh.visible = false;
    scene.add(mesh);
    sparks[i] = { mesh, material, ttl: 0, active: false };
  }
  let nextSparkIdx = 0;

  let active = false;
  let fireTimer = 0;

  const prevPosTmp = new THREE.Vector3();
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

  // update() refreshes cameraWorldPos once per frame before any billboarding.
  function billboardFlash(flash) {
    flash.lookAt(cameraWorldPos);
  }

  function spawnSpark(point) {
    const s = sparks[nextSparkIdx];
    nextSparkIdx = (nextSparkIdx + 1) % SPARK_MAX;
    s.active = true;
    s.ttl = SPARK_TTL;
    s.mesh.position.set(point.x, point.y, point.z);
    s.mesh.scale.setScalar(1);
    s.material.opacity = 1;
    s.mesh.visible = true;
  }

  return {
    update(dt, input) {
      camera.getWorldPosition(cameraWorldPos);

      for (let i = 0; i < BULLET_MAX; i++) {
        const b = bullets[i];
        if (!b.active) continue;
        prevPosTmp.copy(b.mesh.position);
        bulletStepTmp.copy(b.velocity).multiplyScalar(dt);
        b.mesh.position.add(bulletStepTmp);
        b.dist += bulletStepTmp.length();
        b.ttl -= dt;
        if (collision) {
          const hit = collision.checkSegment(prevPosTmp, b.mesh.position);
          if (hit) {
            spawnSpark(hit.point);
            b.active = false;
            b.mesh.visible = false;
            continue;
          }
        }
        if (b.ttl <= 0 || b.dist >= BULLET_MAX_DIST) {
          b.active = false;
          b.mesh.visible = false;
        }
      }

      for (let i = 0; i < SPARK_MAX; i++) {
        const s = sparks[i];
        if (!s.active) continue;
        s.ttl -= dt;
        if (s.ttl <= 0) {
          s.active = false;
          s.mesh.visible = false;
          continue;
        }
        const life = s.ttl / SPARK_TTL;
        s.material.opacity = life;
        s.mesh.scale.setScalar(1 + (1 - life) * 1.5);
        s.mesh.lookAt(cameraWorldPos);
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
        for (let i = 0; i < SPARK_MAX; i++) {
          const s = sparks[i];
          if (s.active) {
            s.active = false;
            s.mesh.visible = false;
          }
        }
      }
    },

    dispose() {
      for (let i = 0; i < BULLET_MAX; i++) {
        scene.remove(bullets[i].mesh);
      }
      for (let i = 0; i < SPARK_MAX; i++) {
        scene.remove(sparks[i].mesh);
        sparks[i].material.dispose();
      }
      airplane.mesh.remove(flashLeft);
      airplane.mesh.remove(flashRight);
      flashLeftMaterial.dispose();
      flashRightMaterial.dispose();
    },
  };
}
