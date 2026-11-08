import type { Position } from "./telemetry.ts";

export interface ReplayCamera { yaw: number; pitch: number; distance: number }
export const DEFAULT_REPLAY_CAMERA: ReplayCamera = { yaw: -.8, pitch: .85, distance: 14500 };

export function projectPosition(point: Position, camera: ReplayCamera, width: number, height: number) {
  const cos = Math.cos(camera.yaw), sin = Math.sin(camera.yaw);
  const elevation = Math.sin(camera.pitch), horizontal = Math.cos(camera.pitch);
  const z = point.z - 400;
  const radial = point.x * cos + point.y * sin;
  const depth = camera.distance - radial * horizontal - z * elevation;
  if (depth <= 50 || width <= 0 || height <= 0) return null;
  const scale = height * 1.15 / depth;
  return {
    x: width / 2 + (-point.x * sin + point.y * cos) * scale,
    y: height / 2 - (-radial * elevation + z * horizontal) * scale,
    depth, scale,
  };
}

export function orbitCamera(camera: ReplayCamera, dx: number, dy: number): ReplayCamera {
  return { ...camera, yaw: camera.yaw - dx * .008, pitch: Math.max(.25, Math.min(1.45, camera.pitch + dy * .006)) };
}

export function zoomCamera(camera: ReplayCamera, delta: number): ReplayCamera {
  return { ...camera, distance: Math.max(10500, Math.min(24000, camera.distance * Math.exp(delta * .001))) };
}
