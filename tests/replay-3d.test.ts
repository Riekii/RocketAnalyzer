import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_REPLAY_CAMERA, orbitCamera, projectPosition, zoomCamera } from "../src/lib/replay-3d.ts";

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
