import assert from "node:assert/strict";
import test from "node:test";
import { carPoint, DEFAULT_REPLAY_CAMERA, orbitCamera, projectPosition, zoomCamera } from "../src/lib/replay-3d.ts";

test("transforma la carrocería con posición y orientación completas, incluido vuelo invertido", () => {
  const position = { x: 10, y: 20, z: 30 };
  const local = { x: 100, y: 0, z: 0 };
  const rotated = carPoint(local, position, { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
  assert.ok(Math.abs(rotated.x - 10) < 1e-8);
  assert.ok(Math.abs(rotated.y - 120) < 1e-8);
  assert.equal(rotated.z, 30);
  assert.deepEqual(carPoint({ x: 0, y: 0, z: 20 }, position, { x: 1, y: 0, z: 0, w: 0 }),
    { x: 10, y: 20, z: 10 });
  assert.deepEqual(carPoint(local, position), { x: 110, y: 20, z: 30 });
});

test("centra el objetivo y proyecta la altura hacia arriba con perspectiva", () => {
  const camera = { ...DEFAULT_REPLAY_CAMERA, yaw: 0 };
  const target = projectPosition({ x: 0, y: 0, z: 400 }, camera, 1000, 500)!;
  assert.equal(target.x, 500);
  assert.equal(target.y, 250);
  const high = projectPosition({ x: 0, y: 0, z: 1000 }, camera, 1000, 500)!;
  assert.ok(high.y < target.y);
  assert.ok(high.scale > target.scale);
});

test("descarta puntos detrás de la cámara y vistas sin tamaño", () => {
  assert.equal(projectPosition({ x: 1e6, y: 0, z: 400 },
    { ...DEFAULT_REPLAY_CAMERA, yaw: 0 }, 1000, 500), null);
  assert.equal(projectPosition({ x: 0, y: 0, z: 0 }, DEFAULT_REPLAY_CAMERA, 0, 500), null);
});

test("mantiene los límites de cámara para evitar atravesar el campo o invertir la vista", () => {
  assert.equal(orbitCamera(DEFAULT_REPLAY_CAMERA, 0, -1e6).pitch, .25);
  assert.equal(orbitCamera(DEFAULT_REPLAY_CAMERA, 0, 1e6).pitch, 1.45);
  assert.equal(zoomCamera(DEFAULT_REPLAY_CAMERA, -1e6).distance, 10500);
  assert.equal(zoomCamera(DEFAULT_REPLAY_CAMERA, 1e6).distance, 24000);
  assert.notEqual(orbitCamera(DEFAULT_REPLAY_CAMERA, 30, 0).yaw, DEFAULT_REPLAY_CAMERA.yaw);
});
